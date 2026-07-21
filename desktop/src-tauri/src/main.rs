#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const DEFAULT_PORT: u16 = 8099;
const DEFAULT_HEALTH_TIMEOUT: Duration = Duration::from_secs(300);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(100);
const WORKSPACE_CONFIG_VERSION: u32 = 1;
const WORKSPACE_CONFIG_FILENAME: &str = "workspace.json";

#[derive(Debug, Clone)]
struct BackendConfig {
    executable: PathBuf,
    script: PathBuf,
    backend_root: PathBuf,
    web_root: PathBuf,
    runtime_root: PathBuf,
    app_data_root: PathBuf,
    workspace: PathBuf,
    application_store: Option<PathBuf>,
    port: u16,
    health_timeout: Duration,
    launcher_is_binary: bool,
}

impl BackendConfig {
    fn from_environment(
        app: &AppHandle,
        app_data_root: PathBuf,
        workspace: PathBuf,
    ) -> Result<Self, String> {
        let (packaged_backend, packaged_runtime, packaged_web) = packaged_resource_paths(app)?;
        let (development_backend, development_web) = development_resource_paths();
        let backend_root = env_path(
            "ECD_TAURI_BACKEND_ROOT",
            packaged_backend.unwrap_or(development_backend),
        );
        let runtime_root = env_path(
            "ECD_TAURI_RUNTIME_ROOT",
            packaged_runtime.unwrap_or_else(|| app_data_root.join("runtime")),
        );
        let web_root = env_path(
            "ECD_TAURI_WEB_ROOT",
            packaged_web.unwrap_or(development_web),
        );
        let executable = env::var_os("ECD_TAURI_BACKEND_EXECUTABLE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                if cfg!(windows) {
                    runtime_root.join("python.exe")
                } else {
                    PathBuf::from("python3")
                }
            });
        let script = env_path(
            "ECD_TAURI_BACKEND_SCRIPT",
            backend_root.join("desktop_launcher.py"),
        );
        let port = parse_port(env::var("ECD_TAURI_PORT").ok().as_deref())?;
        let health_timeout = parse_duration(
            env::var("ECD_TAURI_HEALTH_TIMEOUT_MS").ok().as_deref(),
            DEFAULT_HEALTH_TIMEOUT,
        )?;
        let application_store = env::var_os("ECD_TAURI_APPLICATION_STORE").map(PathBuf::from);
        let launcher_is_binary = env::var("ECD_TAURI_BACKEND_BINARY")
            .map(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);

        Ok(Self {
            executable,
            script,
            backend_root,
            web_root,
            runtime_root,
            app_data_root,
            workspace,
            application_store,
            port,
            health_timeout,
            launcher_is_binary,
        })
    }

    fn with_workspace(&self, workspace: PathBuf) -> Self {
        let mut next = self.clone();
        next.workspace = workspace;
        next
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.executable);
        if !self.launcher_is_binary {
            command.arg("-B").arg(&self.script);
        }
        command
            .arg("--runtime-root")
            .arg(&self.runtime_root)
            .arg("--app-data-root")
            .arg(&self.app_data_root)
            .arg("--workspace")
            .arg(&self.workspace)
            .arg("--backend-root")
            .arg(&self.backend_root)
            .arg("--web-root")
            .arg(&self.web_root)
            .arg("--port")
            .arg(self.port.to_string());
        if let Some(application_store) = &self.application_store {
            command.arg("--application-store").arg(application_store);
        }
        command
            .current_dir(&self.backend_root)
            .env("ECD_MODE", "desktop")
            .env("HOST", "127.0.0.1")
            .env("PORT", self.port.to_string())
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .env("PYTHONNOUSERSITE", "1")
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        command
    }
}

struct BackendProcess {
    child: Mutex<Child>,
    #[cfg(windows)]
    job: Mutex<Option<windows_job::JobObject>>,
    stopped: AtomicBool,
}

impl BackendProcess {
    fn start(config: &BackendConfig) -> Result<Self, String> {
        if config.launcher_is_binary {
            if !config.executable.is_file() {
                return Err(format!("Backend executable does not exist: {}", config.executable.display()));
            }
        } else if !config.script.is_file() {
            return Err(format!("Backend launcher does not exist: {}", config.script.display()));
        }

        let mut command = config.command();
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start backend '{}': {error}", config.executable.display()))?;

        #[cfg(windows)]
        let job = match windows_job::JobObject::for_child(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };

        #[cfg(not(windows))]
        let _ = &mut child;

        Ok(Self {
            child: Mutex::new(child),
            #[cfg(windows)]
            job: Mutex::new(Some(job)),
            stopped: AtomicBool::new(false),
        })
    }

    fn wait_until_ready(&self, port: u16, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        loop {
            {
                let mut child = self.child.lock().map_err(|_| "Backend process lock poisoned".to_string())?;
                if let Some(status) = child
                    .try_wait()
                    .map_err(|error| format!("Could not inspect backend process: {error}"))?
                {
                    return Err(format!("Backend exited before health check with status {status}"));
                }
            }

            if health_check(port) {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!("Backend did not become ready on 127.0.0.1:{port}"));
            }
            thread::sleep(HEALTH_POLL_INTERVAL);
        }
    }

    fn shutdown(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }

        #[cfg(windows)]
        if let Ok(mut job) = self.job.lock() {
            // Closing a Job Object configured with KILL_ON_JOB_CLOSE terminates
            // the backend and every descendant without relying on taskkill.
            job.take();
        }

        if let Ok(mut child) = self.child.lock() {
            #[cfg(not(windows))]
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct BackendController {
    process: Mutex<Option<BackendProcess>>,
    config: Mutex<BackendConfig>,
}

impl BackendController {
    fn shutdown(&self) {
        if let Ok(mut process) = self.process.lock() {
            if let Some(process) = process.take() {
                process.shutdown();
            }
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct WorkspaceRecord {
    version: u32,
    workspace: String,
}

fn app_data_root_from_environment() -> PathBuf {
    env::var_os("ECD_TAURI_APP_DATA_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|| home_dir().join(".ecd"))
                .join("ECD")
        })
}

fn workspace_config_path(app_data_root: &PathBuf) -> PathBuf {
    app_data_root.join(WORKSPACE_CONFIG_FILENAME)
}

fn canonical_path(path: &PathBuf) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("Could not resolve path '{}': {error}", path.display()))
}

fn paths_overlap(first: &PathBuf, second: &PathBuf) -> Result<bool, String> {
    let first = canonical_path(first)?;
    let second = canonical_path(second)?;
    let first_text = first.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    let second_text = second.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    Ok(first_text == second_text || first_text.starts_with(&(second_text.clone() + "\\")) || second_text.starts_with(&(first_text + "\\")))
}

fn writable_probe(directory: &PathBuf) -> Result<(), String> {
    let probe = directory.join(format!(".ecd-write-{}", std::process::id()));
    fs::write(&probe, b"ok\n")
        .map_err(|error| format!("Workspace is not writable '{}': {error}", directory.display()))?;
    let _ = fs::remove_file(probe);
    Ok(())
}

fn prepare_workspace(workspace: &PathBuf, app_data_root: &PathBuf) -> Result<PathBuf, String> {
    if !workspace.is_dir() {
        return Err(format!("Selected workspace is not a directory: {}", workspace.display()));
    }
    if paths_overlap(workspace, app_data_root)? {
        return Err("Workspace must be separate from application data".to_string());
    }
    let workspace = canonical_path(workspace)?;
    writable_probe(&workspace)?;
    for directory in [
        workspace.join("esp_projects"),
        workspace.join("esp_assets").join("fonts"),
        workspace.join("esp_assets").join("images"),
        workspace.join("esp_assets").join("audio"),
    ] {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create workspace directory '{}': {error}", directory.display()))?;
        writable_probe(&directory)?;
    }
    Ok(workspace)
}

fn save_workspace(app_data_root: &PathBuf, workspace: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(app_data_root)
        .map_err(|error| format!("Could not create application data directory: {error}"))?;
    writable_probe(app_data_root)?;
    let record = WorkspaceRecord {
        version: WORKSPACE_CONFIG_VERSION,
        workspace: workspace.to_string_lossy().into_owned(),
    };
    let path = workspace_config_path(app_data_root);
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(&record).map_err(|error| format!("Could not encode workspace config: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not write workspace config: {error}"))?;
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&path);
        fs::rename(&temporary, &path)
            .map_err(|_| format!("Could not replace workspace config: {error}"))?;
    }
    Ok(())
}

fn read_saved_workspace(app_data_root: &PathBuf) -> Option<PathBuf> {
    let path = workspace_config_path(app_data_root);
    let contents = fs::read_to_string(path).ok()?;
    let record: WorkspaceRecord = serde_json::from_str(&contents).ok()?;
    if record.version != WORKSPACE_CONFIG_VERSION || record.workspace.trim().is_empty() {
        return None;
    }
    Some(PathBuf::from(record.workspace))
}

fn default_workspace(profile: &PathBuf) -> PathBuf {
    profile.join("Documents").join("ecd_workspace")
}

fn prepare_default_workspace(app_data_root: &PathBuf) -> Result<PathBuf, String> {
    let workspace = default_workspace(&home_dir());
    fs::create_dir_all(&workspace).map_err(|error| {
        format!(
            "Could not create the default workspace '{}': {error}",
            workspace.display()
        )
    })?;
    let workspace = prepare_workspace(&workspace, app_data_root)?;
    save_workspace(app_data_root, &workspace)?;
    Ok(workspace)
}

fn show_workspace_error(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("Workspace required")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

fn pick_workspace(app: &AppHandle, app_data_root: &PathBuf) -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("ECD_TAURI_WORKSPACE") {
        let configured = PathBuf::from(configured);
        let workspace = prepare_workspace(&configured, app_data_root)?;
        save_workspace(app_data_root, &workspace)?;
        return Ok(workspace);
    }
    if let Some(saved) = read_saved_workspace(app_data_root) {
        if let Ok(workspace) = prepare_workspace(&saved, app_data_root) {
            return Ok(workspace);
        }
    }

    match prepare_default_workspace(app_data_root) {
        Ok(workspace) => return Ok(workspace),
        Err(error) => show_workspace_error(
            app,
            &format!("{error}\n\nChoose another workspace directory to continue."),
        ),
    }

    pick_workspace_from_dialog(app, app_data_root)
}

fn pick_workspace_from_dialog(app: &AppHandle, app_data_root: &PathBuf) -> Result<PathBuf, String> {
    loop {
        let selection = app
            .dialog()
            .file()
            .set_title("Choose ESPConfig Designer workspace")
            .set_directory(home_dir())
            .blocking_pick_folder();
        let Some(selection) = selection else {
            let message = "Workspace selection was canceled. The backend was not started.";
            show_workspace_error(app, message);
            return Err(message.to_string());
        };
        let selected = selection
            .into_path()
            .map_err(|_| "The selected workspace path is not a local filesystem path".to_string())?;
        match prepare_workspace(&selected, app_data_root) {
            Ok(workspace) => {
                save_workspace(app_data_root, &workspace)?;
                return Ok(workspace);
            }
            Err(error) => show_workspace_error(app, &error),
        }
    }
}

#[cfg(windows)]
fn path_for_child_process(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

#[cfg(not(windows))]
fn path_for_child_process(path: PathBuf) -> PathBuf {
    path
}

fn packaged_resource_paths(app: &AppHandle) -> Result<(Option<PathBuf>, Option<PathBuf>, Option<PathBuf>), String> {
    let resource_root = if let Some(value) = env::var_os("ECD_TAURI_RESOURCE_ROOT") {
        PathBuf::from(value)
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| format!("Could not resolve Tauri resource directory: {error}"))?
            .join("ecd-app")
    };
    let resource_root = path_for_child_process(resource_root);
    let backend = resource_root.join("backend");
    let runtime = resource_root.join("runtime");
    let web = backend.join("web");
    if backend.join("server.py").is_file() && runtime.join("python.exe").is_file() && web.join("index.html").is_file() {
        return Ok((Some(backend), Some(runtime), Some(web)));
    }
    Ok((None, None, None))
}

fn development_resource_paths() -> (PathBuf, PathBuf) {
    if let Ok(executable) = env::current_exe() {
        for ancestor in executable.ancestors() {
            let backend = ancestor.join("esp-config-designer");
            let frontend = ancestor.join("esp-config-designer-frontend").join("dist");
            if backend.join("server.py").is_file() {
                return (backend, frontend);
            }
        }
    }
    (
        PathBuf::from("esp-config-designer"),
        PathBuf::from("esp-config-designer-frontend").join("dist"),
    )
}

fn active_jobs(port: u16) -> Result<bool, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|error| format!("Could not contact the backend: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Could not configure backend check: {error}"))?;
    let request = format!(
        "GET /api/jobs/active HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Could not query active jobs: {error}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("Could not read active jobs: {error}"))?;
    let response = String::from_utf8_lossy(&response);
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Invalid active-jobs response".to_string())?;
    if !headers.starts_with("HTTP/1.1 200") {
        return Err(format!("Backend refused workspace change: {headers}"));
    }
    let payload: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid active-jobs payload: {error}"))?;
    Ok(payload
        .get("jobs")
        .and_then(serde_json::Value::as_array)
        .map(|jobs| {
            jobs.iter().any(|job| {
                matches!(
                    job.get("state").and_then(serde_json::Value::as_str),
                    Some("queued") | Some("running")
                )
            })
        })
        .unwrap_or(false))
}

fn change_workspace_inner(app: &AppHandle, state: &BackendController) -> Result<String, String> {
    let current_config = state
        .config
        .lock()
        .map_err(|_| "Backend configuration lock poisoned".to_string())?
        .clone();
    if active_jobs(current_config.port)? {
        return Err("Workspace cannot be changed while a job is active.".to_string());
    }
    let next_workspace = pick_workspace_from_dialog(&app, &current_config.app_data_root)?;
    if next_workspace == current_config.workspace {
        return Ok(next_workspace.to_string_lossy().into_owned());
    }
    if active_jobs(current_config.port)? {
        return Err("Workspace cannot be changed while a job is active.".to_string());
    }

    save_workspace(&current_config.app_data_root, &next_workspace)?;
    state.shutdown();
    let next_config = current_config.with_workspace(next_workspace.clone());
    let next_process = match BackendProcess::start(&next_config) {
        Ok(process) => process,
        Err(error) => {
            let _ = save_workspace(&current_config.app_data_root, &current_config.workspace);
            let restored = BackendProcess::start(&current_config)?;
            let _ = restored.wait_until_ready(current_config.port, current_config.health_timeout);
            if let Ok(mut process) = state.process.lock() {
                *process = Some(restored);
            }
            return Err(error);
        }
    };
    if let Err(error) = next_process.wait_until_ready(next_config.port, next_config.health_timeout) {
        next_process.shutdown();
        let _ = save_workspace(&current_config.app_data_root, &current_config.workspace);
        let restored = BackendProcess::start(&current_config)?;
        let _ = restored.wait_until_ready(current_config.port, current_config.health_timeout);
        if let Ok(mut process) = state.process.lock() {
            *process = Some(restored);
        }
        return Err(error);
    }
    if let Ok(mut config) = state.config.lock() {
        *config = next_config;
    }
    if let Ok(mut process) = state.process.lock() {
        *process = Some(next_process);
    }
    Ok(next_workspace.to_string_lossy().into_owned())
}

#[tauri::command]
fn change_workspace(app: AppHandle, state: State<'_, BackendController>) -> Result<String, String> {
    let workspace = change_workspace_inner(&app, state.inner())?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.location.reload()");
    }
    Ok(workspace)
}

fn health_check(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = Vec::new();
    if stream.read_to_end(&mut response).is_err() {
        return false;
    }
    let response = String::from_utf8_lossy(&response);
    let Some((headers, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    headers.starts_with("HTTP/1.1 200")
        && body.contains("\"status\":\"ok\"")
        && body.contains("\"mode\":\"desktop\"")
}

fn open_window(app: &AppHandle, port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}/");
    let target_url = tauri::Url::parse(&url).map_err(|_| "Invalid backend URL".to_string())?;
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target_url))
        .title("ESPConfig Designer")
        .inner_size(1440.0, 920.0)
        .min_inner_size(960.0, 640.0)
        .build()
        .map(|_| ())
        .map_err(|error| format!("Could not open desktop UI: {error}"))
}

fn env_path(name: &str, default: PathBuf) -> PathBuf {
    env::var_os(name).map(PathBuf::from).unwrap_or(default)
}

fn parse_port(value: Option<&str>) -> Result<u16, String> {
    let raw = value.unwrap_or("").trim();
    let port = if raw.is_empty() {
        DEFAULT_PORT
    } else {
        raw.parse::<u16>()
            .map_err(|_| "ECD_TAURI_PORT must be an integer between 1 and 65535".to_string())?
    };
    if port == 0 {
        return Err("ECD_TAURI_PORT must be between 1 and 65535".to_string());
    }
    Ok(port)
}

fn parse_duration(value: Option<&str>, default: Duration) -> Result<Duration, String> {
    let raw = value.unwrap_or("").trim();
    if raw.is_empty() {
        return Ok(default);
    }
    let milliseconds = raw
        .parse::<u64>()
        .map_err(|_| "ECD_TAURI_HEALTH_TIMEOUT_MS must be a positive integer".to_string())?;
    if milliseconds == 0 {
        return Err("ECD_TAURI_HEALTH_TIMEOUT_MS must be greater than zero".to_string());
    }
    Ok(Duration::from_millis(milliseconds))
}

fn home_dir() -> PathBuf {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![change_workspace])
        .setup(|app| {
            let app_data_root = app_data_root_from_environment();
            fs::create_dir_all(&app_data_root)
                .map_err(|error| Box::<dyn std::error::Error>::from(format!("Could not create application data directory: {error}")))?;
            let workspace = pick_workspace(app.handle(), &app_data_root)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            let config = BackendConfig::from_environment(app.handle(), app_data_root, workspace)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            let backend = BackendProcess::start(&config)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            backend
                .wait_until_ready(config.port, config.health_timeout)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            open_window(app.handle(), config.port)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(BackendController {
                process: Mutex::new(Some(backend)),
                config: Mutex::new(config),
            });
            Ok(())
        });
    match builder.build(tauri::generate_context!()) {
        Ok(app) => app.run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(backend) = app.try_state::<BackendController>() {
                    backend.inner().shutdown();
                }
            }
        }),
        Err(error) => {
            eprintln!("ESPConfig Designer could not start: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before epoch")
            .as_nanos();
        env::temp_dir().join(format!("ecd-tauri-{name}-{suffix}"))
    }

    #[test]
    fn workspace_preparation_creates_user_layout() {
        let root = test_root("workspace");
        let app_data = root.join("app-data");
        let workspace = root.join("workspace with spaces");
        fs::create_dir_all(&app_data).expect("create app data");
        fs::create_dir_all(&workspace).expect("create workspace");

        let prepared = prepare_workspace(&workspace, &app_data).expect("prepare workspace");

        assert_eq!(prepared, canonical_path(&workspace).expect("canonical workspace"));
        assert!(workspace.join("esp_projects").is_dir());
        assert!(workspace.join("esp_assets/fonts").is_dir());
        assert!(workspace.join("esp_assets/images").is_dir());
        assert!(workspace.join("esp_assets/audio").is_dir());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn default_workspace_uses_documents_directory() {
        let profile = PathBuf::from(r"C:\Users\Workspace User żółć");

        assert_eq!(
            default_workspace(&profile),
            profile.join("Documents").join("ecd_workspace")
        );
    }

    #[test]
    fn workspace_preparation_rejects_app_data_overlap() {
        let root = test_root("overlap");
        let app_data = root.join("app-data");
        let workspace = app_data.join("workspace");
        fs::create_dir_all(&workspace).expect("create workspace");

        let error = prepare_workspace(&workspace, &app_data).expect_err("overlap must fail");

        assert!(error.contains("separate from application data"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_record_survives_restart() {
        let root = test_root("record");
        let app_data = root.join("app-data");
        let workspace = root.join("workspace");
        fs::create_dir_all(&app_data).expect("create app data");
        fs::create_dir_all(&workspace).expect("create workspace");
        save_workspace(&app_data, &workspace).expect("save workspace");

        let saved = read_saved_workspace(&app_data).expect("read workspace");

        assert_eq!(saved, workspace);
        assert!(workspace_config_path(&app_data).is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backend_command_uses_utf8_for_python_io() {
        let root = test_root("utf8-command");
        let config = BackendConfig {
            executable: root.join("python.exe"),
            script: root.join("desktop_launcher.py"),
            backend_root: root.join("backend"),
            web_root: root.join("web"),
            runtime_root: root.join("runtime"),
            app_data_root: root.join("app-data"),
            workspace: root.join("Workspace żółć 東京"),
            application_store: None,
            port: DEFAULT_PORT,
            health_timeout: DEFAULT_HEALTH_TIMEOUT,
            launcher_is_binary: false,
        };

        let command = config.command();
        let arguments: Vec<_> = command.get_args().collect();
        let python_utf8 = command
            .get_envs()
            .find(|(name, _)| *name == OsStr::new("PYTHONUTF8"))
            .and_then(|(_, value)| value);
        let python_io_encoding = command
            .get_envs()
            .find(|(name, _)| *name == OsStr::new("PYTHONIOENCODING"))
            .and_then(|(_, value)| value);

        assert_eq!(python_utf8, Some(OsStr::new("1")));
        assert_eq!(python_io_encoding, Some(OsStr::new("utf-8")));
        assert!(command
            .get_envs()
            .any(|(name, value)| name == OsStr::new("PYTHONPATH") && value.is_none()));
        assert!(command
            .get_envs()
            .any(|(name, value)| name == OsStr::new("PYTHONHOME") && value.is_none()));
        assert!(command
            .get_envs()
            .any(|(name, value)| name == OsStr::new("PYTHONNOUSERSITE") && value == Some(OsStr::new("1"))));
        assert_eq!(arguments.first().copied(), Some(OsStr::new("-B")));
        assert_eq!(arguments.get(1).copied(), Some(config.script.as_os_str()));
    }

    #[cfg(windows)]
    #[test]
    fn child_process_path_removes_windows_verbatim_prefix() {
        let path = PathBuf::from(r"\\?\C:\Users\Test\ESPConfig Designer\ecd-app");

        assert_eq!(
            path_for_child_process(path),
            PathBuf::from(r"C:\Users\Test\ESPConfig Designer\ecd-app")
        );
    }
}

#[cfg(windows)]
mod windows_job {
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    type Handle = isize;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;

    #[repr(C)]
    struct BasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct ExtendedLimitInformation {
        basic_limit_information: BasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            class: u32,
            information: *mut c_void,
            information_length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    pub struct JobObject {
        handle: Handle,
    }

    impl JobObject {
        pub fn for_child(child: &Child) -> Result<Self, String> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle == 0 {
                    return Err("Could not create Windows Job Object".to_string());
                }
                let mut limits: ExtendedLimitInformation = std::mem::zeroed();
                limits.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let configured = SetInformationJobObject(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    (&mut limits as *mut ExtendedLimitInformation).cast(),
                    size_of::<ExtendedLimitInformation>() as u32,
                );
                if configured == 0 || AssignProcessToJobObject(handle, child.as_raw_handle() as Handle) == 0 {
                    let _ = CloseHandle(handle);
                    return Err("Could not attach backend to Windows Job Object".to_string());
                }
                Ok(Self { handle })
            }
        }
    }

    impl Drop for JobObject {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
        }
    }
}
