use std::env;
use std::ffi::OsStr;
use std::fmt;
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, WAIT_ABANDONED, WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND,
};

const STARTUP_GUARD_NAME: &str = r"Local\com.espconfigdesigner.desktop.startup-guard";
const STARTUP_GUARD_TIMEOUT: Duration = Duration::from_secs(10);
const TEST_HOLD_ENV: &str = "ECD_TAURI_TEST_STARTUP_GUARD_HOLD_MS";
const MAX_TEST_HOLD: Duration = Duration::from_millis(5000);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupGuardError {
    CreateFailed(u32),
    Timeout,
    WaitFailed(u32),
    UnexpectedWaitResult(u32),
    ReleaseFailed(u32),
    OwnerThreadFailed,
    InvalidTestHold,
}

impl fmt::Display for StartupGuardError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CreateFailed(code) => write!(formatter, "Could not create the Windows startup guard (Windows error {code})."),
            Self::Timeout => write!(formatter, "Another ESPConfig Designer startup is still in progress or is blocked. Wait a moment and try again."),
            Self::WaitFailed(code) => write!(formatter, "Could not wait for the Windows startup guard (Windows error {code})."),
            Self::UnexpectedWaitResult(result) => write!(formatter, "The Windows startup guard returned an unexpected wait result ({result:#x})."),
            Self::ReleaseFailed(code) => write!(formatter, "Could not release the Windows startup guard (Windows error {code})."),
            Self::OwnerThreadFailed => write!(formatter, "The Windows startup guard owner thread stopped unexpectedly."),
            Self::InvalidTestHold => write!(formatter, "{TEST_HOLD_ENV} must be an integer from 1 through 5000."),
        }
    }
}

impl std::error::Error for StartupGuardError {}

#[derive(Debug, Clone, PartialEq, Eq)]
enum WaitOutcome {
    Acquired,
    Timeout,
    Failed(u32),
    Unexpected(u32),
}

fn map_wait_result(result: u32, windows_error: u32) -> WaitOutcome {
    match result {
        WAIT_OBJECT_0 | WAIT_ABANDONED => WaitOutcome::Acquired,
        WAIT_TIMEOUT => WaitOutcome::Timeout,
        WAIT_FAILED => WaitOutcome::Failed(windows_error),
        other => WaitOutcome::Unexpected(other),
    }
}

#[derive(Debug)]
pub struct StartupGuard {
    release_sender: Option<SyncSender<()>>,
    completion_receiver: Receiver<Result<(), StartupGuardError>>,
    owner_thread: Option<JoinHandle<()>>,
}

impl StartupGuard {
    pub fn acquire() -> Result<Self, StartupGuardError> {
        acquire_named(
            STARTUP_GUARD_NAME,
            STARTUP_GUARD_TIMEOUT,
            test_hold_duration()?,
        )
    }

    pub fn release(mut self) -> Result<(), StartupGuardError> {
        self.release_inner()
    }

    fn release_inner(&mut self) -> Result<(), StartupGuardError> {
        if let Some(sender) = self.release_sender.take() {
            sender
                .send(())
                .map_err(|_| StartupGuardError::OwnerThreadFailed)?;
        }
        let result = self
            .completion_receiver
            .recv()
            .map_err(|_| StartupGuardError::OwnerThreadFailed)?;
        if let Some(thread) = self.owner_thread.take() {
            thread
                .join()
                .map_err(|_| StartupGuardError::OwnerThreadFailed)?;
        }
        result
    }
}

impl Drop for StartupGuard {
    fn drop(&mut self) {
        if self.owner_thread.is_none() {
            return;
        }
        let _ = self.release_sender.take().map(|sender| sender.send(()));
        let _ = self.completion_receiver.recv();
        if let Some(thread) = self.owner_thread.take() {
            let _ = thread.join();
        }
    }
}

fn acquire_named(
    name: &str,
    timeout: Duration,
    test_hold: Option<Duration>,
) -> Result<StartupGuard, StartupGuardError> {
    let name = encode_wide(name);
    let timeout_millis = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);
    let (acquired_sender, acquired_receiver) = mpsc::sync_channel(0);
    let (release_sender, release_receiver) = mpsc::sync_channel(0);
    let (completion_sender, completion_receiver) = mpsc::sync_channel(0);
    let owner_thread = thread::Builder::new()
        .name("ecd-startup-guard".to_string())
        .spawn(move || {
            let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
            if handle.is_null() {
                let _ = acquired_sender.send(Err(StartupGuardError::CreateFailed(unsafe {
                    GetLastError()
                })));
                return;
            }

            let wait_result = unsafe { WaitForSingleObject(handle, timeout_millis) };
            let outcome = map_wait_result(wait_result, unsafe { GetLastError() });
            let acquisition = match outcome {
                WaitOutcome::Acquired => Ok(()),
                WaitOutcome::Timeout => Err(StartupGuardError::Timeout),
                WaitOutcome::Failed(code) => Err(StartupGuardError::WaitFailed(code)),
                WaitOutcome::Unexpected(result) => {
                    Err(StartupGuardError::UnexpectedWaitResult(result))
                }
            };
            if let Err(error) = acquisition {
                unsafe { CloseHandle(handle) };
                let _ = acquired_sender.send(Err(error));
                return;
            }
            if let Some(duration) = test_hold {
                thread::sleep(duration);
            }
            if acquired_sender.send(Ok(())).is_err() {
                unsafe {
                    ReleaseMutex(handle);
                    CloseHandle(handle);
                }
                return;
            }

            let _ = release_receiver.recv();
            let release_result = if unsafe { ReleaseMutex(handle) } == 0 {
                Err(StartupGuardError::ReleaseFailed(unsafe { GetLastError() }))
            } else {
                Ok(())
            };
            unsafe { CloseHandle(handle) };
            let _ = completion_sender.send(release_result);
        })
        .map_err(|_| StartupGuardError::OwnerThreadFailed)?;

    match acquired_receiver.recv() {
        Ok(Ok(())) => Ok(StartupGuard {
            release_sender: Some(release_sender),
            completion_receiver,
            owner_thread: Some(owner_thread),
        }),
        Ok(Err(error)) => {
            let _ = owner_thread.join();
            Err(error)
        }
        Err(_) => {
            let _ = owner_thread.join();
            Err(StartupGuardError::OwnerThreadFailed)
        }
    }
}

fn test_hold_duration() -> Result<Option<Duration>, StartupGuardError> {
    let Some(value) = env::var_os(TEST_HOLD_ENV) else {
        return Ok(None);
    };
    let milliseconds = value
        .to_string_lossy()
        .trim()
        .parse::<u64>()
        .map_err(|_| StartupGuardError::InvalidTestHold)?;
    let duration = Duration::from_millis(milliseconds);
    if duration.is_zero() || duration > MAX_TEST_HOLD {
        return Err(StartupGuardError::InvalidTestHold);
    }
    Ok(Some(duration))
}

pub fn show_startup_error(error: &StartupGuardError) {
    let message = encode_wide(error.to_string());
    let title = encode_wide("ESPConfig Designer could not start");
    unsafe {
        MessageBoxW(
            ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND,
        );
    }
}

fn encode_wide(value: impl AsRef<OsStr>) -> Vec<u16> {
    value.as_ref().encode_wide().chain(Some(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows_sys::Win32::System::Threading::INFINITE;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn test_mutex_name(label: &str) -> String {
        format!(
            r"Local\com.espconfigdesigner.desktop.startup-guard.test.{}.{}.{}",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed),
            label
        )
    }

    #[test]
    fn startup_guard_maps_windows_wait_results() {
        assert_eq!(map_wait_result(WAIT_OBJECT_0, 0), WaitOutcome::Acquired);
        assert_eq!(map_wait_result(WAIT_ABANDONED, 0), WaitOutcome::Acquired);
        assert_eq!(map_wait_result(WAIT_TIMEOUT, 0), WaitOutcome::Timeout);
        assert_eq!(map_wait_result(WAIT_FAILED, 123), WaitOutcome::Failed(123));
        assert_eq!(map_wait_result(7, 0), WaitOutcome::Unexpected(7));
    }

    #[test]
    fn startup_guard_releases_explicitly_on_the_owner_thread() {
        let name = test_mutex_name("release");
        let guard = acquire_named(&name, Duration::from_secs(1), None).expect("acquire guard");
        let contender = unsafe { CreateMutexW(ptr::null(), 0, encode_wide(&name).as_ptr()) };
        assert!(!contender.is_null());
        assert_eq!(unsafe { WaitForSingleObject(contender, 0) }, WAIT_TIMEOUT);

        guard.release().expect("release guard");

        assert_eq!(
            unsafe { WaitForSingleObject(contender, 1000) },
            WAIT_OBJECT_0
        );
        assert_ne!(unsafe { ReleaseMutex(contender) }, 0);
        unsafe { CloseHandle(contender) };
    }

    #[test]
    fn startup_guard_explicit_release_disarms_drop_fallback() {
        let name = test_mutex_name("single-release");
        let mut guard = acquire_named(&name, Duration::from_secs(1), None).expect("acquire guard");

        guard.release_inner().expect("release guard");

        assert!(guard.release_sender.is_none());
        assert!(guard.owner_thread.is_none());
        drop(guard);
    }

    #[test]
    fn startup_guard_drop_releases_without_a_stale_lock() {
        let name = test_mutex_name("drop");
        let guard = acquire_named(&name, Duration::from_secs(1), None).expect("acquire guard");
        let contender = unsafe { CreateMutexW(ptr::null(), 0, encode_wide(&name).as_ptr()) };
        assert!(!contender.is_null());
        drop(guard);

        assert_eq!(
            unsafe { WaitForSingleObject(contender, 1000) },
            WAIT_OBJECT_0
        );
        assert_ne!(unsafe { ReleaseMutex(contender) }, 0);
        unsafe { CloseHandle(contender) };
    }

    #[test]
    fn startup_guard_timeout_is_fail_closed() {
        let name = test_mutex_name("timeout");
        let owner_name = encode_wide(&name);
        let (sender, receiver) = mpsc::sync_channel(0);
        let owner = thread::spawn(move || {
            let handle = unsafe { CreateMutexW(ptr::null(), 1, owner_name.as_ptr()) };
            assert!(!handle.is_null());
            sender.send(()).expect("owner ready");
            thread::sleep(Duration::from_millis(200));
            assert_ne!(unsafe { ReleaseMutex(handle) }, 0);
            unsafe { CloseHandle(handle) };
        });
        receiver.recv().expect("wait for owner");

        let error = acquire_named(&name, Duration::from_millis(20), None)
            .expect_err("contender must time out");

        assert_eq!(error, StartupGuardError::Timeout);
        owner.join().expect("owner thread");
    }

    #[test]
    fn startup_guard_test_hold_is_strictly_bounded() {
        assert_eq!(MAX_TEST_HOLD, Duration::from_millis(5000));
        assert!(Duration::from_millis(5001) > MAX_TEST_HOLD);
        assert_eq!(INFINITE, u32::MAX);
    }
}
