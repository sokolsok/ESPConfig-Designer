import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ESPLoader, Transport } from "esptool-js";

export const useInstallConsoleFlow = (options) => {
  const compileModalOpen = ref(false);
  const compileConsoleRef = ref(null);
  const setCompileConsoleElement = (element) => {
    compileConsoleRef.value = element;
  };

  const compileAutoScroll = ref(true);
  const compileJobId = ref("");
  const compileJobState = ref("");
  const backendJobState = ref("");
  const compileJobError = ref("");
  const compileLogLines = ref([]);
  const compileLogSeq = ref(0);
  const compileActiveAction = ref("");
  const compileIsReconnecting = ref(false);
  const compileTailCheckpoint = ref(0);
  const installPlanMode = ref("");
  const installPlanSerialPort = ref(null);
  const installPlanDownloadReady = ref(false);
  const consoleSessionTitle = ref("");
  const localFlashRunning = ref(false);
  const compileSseLogSeen = ref(false);
  const compileReconnectAttempts = ref(0);

  const preferCompileLongPoll = options.preferLongPoll === true;
  const compileMaxLogLines = 5000;
  const compileLogChunkSize = 200;
  const compileMaxReconnectAttempts = 6;

  let compileStreamSource = null;
  let compileStatusPollId = null;
  let compileLongPollActive = false;
  let compileLongPollJobId = "";
  let compileLongPollSessionId = 0;
  let compileStreamSessionId = 0;
  let compileTailStartTimer = null;
  let compileReconnectTimer = null;
  let compileLogFlushHandle = null;
  let compileLogScrollHandle = null;
  const compileLogQueue = [];

  const canInstall = computed(() => Boolean(options.canInstall?.value ?? options.canInstall?.() ?? false));
  const canUseOta = computed(() => Boolean(options.canUseOta?.value ?? options.canUseOta?.() ?? false));
  const canLogs = computed(() => Boolean(options.canLogs?.value ?? options.canLogs?.() ?? false));

  const compileIsActive = computed(() => ["queued", "running"].includes(compileJobState.value));
  const backendJobIsActive = computed(() => ["queued", "running"].includes(backendJobState.value));
  const canCancelCompile = computed(
    () => Boolean(compileJobId.value) && backendJobIsActive.value && !localFlashRunning.value
  );
  const canDownloadCompiledBinary = computed(
    () =>
      compileModalOpen.value &&
      installPlanMode.value === "download" &&
      installPlanDownloadReady.value &&
      compileJobState.value === "success"
  );
  const canCloseCompile = computed(
    () => Boolean(compileModalOpen.value) && !localFlashRunning.value
  );
  const terminalTitle = computed(() => consoleSessionTitle.value || "Compile Console");
  const compileStateLabel = computed(() => {
    if (!compileJobState.value) return "Idle";
    if (compileJobState.value === "queued") return "Queued";
    if (compileJobState.value === "running") return "Running";
    if (compileJobState.value === "success") return "Success";
    if (compileJobState.value === "failed") return "Failed";
    if (compileJobState.value === "canceled") return "Canceled";
    return compileJobState.value;
  });
  const compileStateClass = computed(() => {
    if (compileJobState.value === "running") return "job-state running";
    if (compileJobState.value === "queued") return "job-state queued";
    if (compileJobState.value === "success") return "job-state success";
    if (compileJobState.value === "failed") return "job-state failed";
    if (compileJobState.value === "canceled") return "job-state failed";
    return "job-state";
  });

  const serialSupported = computed(() => "serial" in navigator);
  const serialSecure = computed(() => window.isSecureContext === true);
  const serialPolicyAllowed = computed(() => {
    const policy = document.permissionsPolicy;
    if (!policy || typeof policy.allowsFeature !== "function") return true;
    try {
      return policy.allowsFeature("serial");
    } catch {
      return true;
    }
  });

  const setError = (message) => {
    if (typeof options.setError === "function") {
      options.setError(message);
    }
  };
  const clearError = () => {
    if (typeof options.clearError === "function") {
      options.clearError();
    }
  };
  const getYamlName = () => String(options.getYamlName?.() || "").trim();
  const getDeviceHost = () => String(options.getDeviceHost?.() || "").trim();

  const parseResponseMessage = async (response, fallback) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.message === "string" && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      // ignore non-json responses
    }
    return `${fallback} (HTTP ${response.status})`;
  };

  const addonFetch = async (path, fetchOptions = {}) => options.fetchApi(path, fetchOptions);
  const buildStreamUrl = (path) => options.streamUrl(path);

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const isAsciiTableLine = (line) => {
    const normalized = String(line || "");
    const trimmed = normalized.trim();
    if (!trimmed) return false;
    const pipeCount = (normalized.match(/\|/g) || []).length;
    if (pipeCount >= 2 && /\|\s*$/.test(normalized)) return true;
    if (/^\s*[+\-|=]+\s*$/.test(normalized) && /[+|]/.test(normalized)) return true;
    return false;
  };

  const compileLineClass = (line) => {
    const classes = ["compile-line"];
    const normalized = String(line || "");
    if (isAsciiTableLine(normalized)) {
      classes.push("line-table");
    }

    const levelMatch = normalized.match(/^\[[0-9:.]+\]\[([A-Z])\]/);
    if (levelMatch) {
      const level = levelMatch[1];
      if (level === "E") classes.push("line-error");
      else if (level === "W") classes.push("line-warn");
      else if (level === "I") classes.push("line-info");
      else if (level === "D") classes.push("line-debug");
      else if (level === "C") classes.push("line-success");
      return classes;
    }

    if (/^\s*(error|failed|exception)\b/i.test(normalized)) classes.push("line-error");
    else if (/^\s*(warn|warning)\b/i.test(normalized)) classes.push("line-warn");
    else if (/^\s*(success|ok)\b/i.test(normalized)) classes.push("line-success");
    else if (/^\s*info\b/i.test(normalized)) classes.push("line-info");
    return classes;
  };

  const formatCompileLine = (line) => {
    const normalized = String(line || "");
    const bracketMatch = normalized.match(/^\[([0-9:.]+)\]\[([A-Z])\](.*)$/);
    if (bracketMatch) {
      const [, ts, level, rest] = bracketMatch;
      const safeLevel = escapeHtml(level);
      return (
        `<span class="log-ts">[${escapeHtml(ts)}]</span>` +
        `<span class="log-rest log-rest-${safeLevel}">${escapeHtml(`[${level}]${rest}`)}</span>`
      );
    }
    return escapeHtml(normalized);
  };

  const scrollCompileToBottom = () => {
    if (!compileAutoScroll.value || !compileConsoleRef.value) return;
    compileConsoleRef.value.scrollTop = compileConsoleRef.value.scrollHeight;
  };

  const scheduleCompileLogScroll = () => {
    if (compileLogScrollHandle) return;
    compileLogScrollHandle = requestAnimationFrame(() => {
      compileLogScrollHandle = null;
      scrollCompileToBottom();
    });
  };

  const flushCompileLogQueue = () => {
    compileLogFlushHandle = null;
    if (!compileLogQueue.length) return;
    const chunk = compileLogQueue.splice(0, compileLogChunkSize);
    chunk.forEach((line) => {
      const text = String(line ?? "");
      const id = compileLogSeq.value;
      compileLogSeq.value += 1;
      compileLogLines.value.push({
        id,
        className: compileLineClass(text).join(" "),
        html: formatCompileLine(text)
      });
    });
    if (compileLogLines.value.length > compileMaxLogLines) {
      compileLogLines.value.splice(0, compileLogLines.value.length - compileMaxLogLines);
    }
    scheduleCompileLogScroll();
    if (compileLogQueue.length) {
      compileLogFlushHandle = requestAnimationFrame(flushCompileLogQueue);
    }
  };

  const queueCompileLogLines = (lines) => {
    if (!Array.isArray(lines) || !lines.length) return;
    compileLogQueue.push(...lines);
    if (!compileLogFlushHandle) {
      compileLogFlushHandle = requestAnimationFrame(flushCompileLogQueue);
    }
  };

  const appendCompileLogLine = (line) => {
    queueCompileLogLines([line]);
  };

  const clearCompileLogQueue = () => {
    compileLogQueue.length = 0;
    if (compileLogFlushHandle) {
      cancelAnimationFrame(compileLogFlushHandle);
      compileLogFlushHandle = null;
    }
    if (compileLogScrollHandle) {
      cancelAnimationFrame(compileLogScrollHandle);
      compileLogScrollHandle = null;
    }
  };

  const resetCompileConsole = () => {
    clearCompileLogQueue();
    compileLogLines.value = [];
    compileLogSeq.value = 0;
  };

  const stopCompileStatusPoll = () => {
    if (!compileStatusPollId) return;
    clearInterval(compileStatusPollId);
    compileStatusPollId = null;
  };

  const stopCompileStream = () => {
    if (compileTailStartTimer) {
      clearTimeout(compileTailStartTimer);
      compileTailStartTimer = null;
    }
    if (compileReconnectTimer) {
      clearTimeout(compileReconnectTimer);
      compileReconnectTimer = null;
    }
    if (compileStreamSource) {
      compileStreamSource.close();
      compileStreamSource = null;
    }
    compileIsReconnecting.value = false;
  };

  const stopCompileLongPoll = () => {
    compileLongPollActive = false;
    compileLongPollJobId = "";
    compileLongPollSessionId += 1;
  };

  const resetInstallPlan = () => {
    installPlanMode.value = "";
    installPlanSerialPort.value = null;
    installPlanDownloadReady.value = false;
  };

  const updateCompileJob = (payload) => {
    const jobPayload = payload?.job && typeof payload.job === "object" ? payload.job : payload;
    if (!jobPayload || typeof jobPayload !== "object") return;
    if (jobPayload.id) compileJobId.value = jobPayload.id;
    if (jobPayload.state) {
      backendJobState.value = jobPayload.state;
      if (!localFlashRunning.value && compileActiveAction.value !== "flash") {
        const keepRunningForSerialFlash =
          installPlanMode.value === "serial" &&
          compileActiveAction.value === "compile" &&
          jobPayload.state === "success";
        compileJobState.value = keepRunningForSerialFlash ? "running" : jobPayload.state;
      }
    }
    if (typeof jobPayload.error_summary === "string") {
      compileJobError.value = jobPayload.error_summary;
    }
  };

  const fetchCompileJobStatus = async (jobId) => {
    if (!jobId) return;
    try {
      const response = await addonFetch(`api/jobs/${jobId}`);
      if (!response.ok) return;
      const payload = await response.json();
      updateCompileJob(payload);
    } catch {
      // ignore status polling errors
    }
  };

  const fetchCompileLogTailWait = async (jobId, sessionId) => {
    if (!jobId) return false;
    try {
      const response = await addonFetch(
        `api/jobs/${jobId}/tail-wait?since=${encodeURIComponent(compileTailCheckpoint.value)}&timeout=5&limit=200`
      );
      if (!response.ok) return false;
      const payload = await response.json();
      const staleSession =
        !compileLongPollActive ||
        compileLongPollSessionId !== sessionId ||
        compileLongPollJobId !== jobId;
      if (staleSession) return false;
      const lines = Array.isArray(payload?.lines) ? payload.lines : [];
      if (lines.length) {
        queueCompileLogLines(lines);
      }
      const nextSeq = Number(payload?.next_seq || 0);
      compileTailCheckpoint.value = Number.isFinite(nextSeq) ? nextSeq : compileTailCheckpoint.value;
      updateCompileJob(payload?.job || payload);
      const jobPayload = payload?.job && typeof payload.job === "object" ? payload.job : payload;
      return jobPayload?.state && ["queued", "running"].includes(jobPayload.state);
    } catch {
      return false;
    }
  };

  const startCompileLongPoll = (jobId) => {
    if (!jobId) return;
    if (compileSseLogSeen.value) return;
    if (compileLongPollActive && compileLongPollJobId === jobId) return;
    stopCompileLongPoll();
    compileLongPollActive = true;
    compileLongPollJobId = jobId;
    const sessionId = compileLongPollSessionId;
    compileIsReconnecting.value = false;
    const loop = async () => {
      while (compileLongPollActive && compileLongPollSessionId === sessionId && compileLongPollJobId === jobId) {
        const shouldContinue = await fetchCompileLogTailWait(jobId, sessionId);
        if (!shouldContinue) break;
      }
      if (compileLongPollSessionId !== sessionId || compileLongPollJobId !== jobId) return;
      compileLongPollActive = false;
      compileLongPollJobId = "";
      await fetchCompileJobStatus(jobId);
    };
    loop();
  };

  const startCompileStatusPoll = (jobId) => {
    stopCompileStatusPoll();
    compileStatusPollId = setInterval(() => {
      fetchCompileJobStatus(jobId);
    }, 1500);
  };

  const startCompileStream = (jobId) => {
    stopCompileStream();
    stopCompileLongPoll();
    if (!jobId) return;
    compileStreamSessionId += 1;
    const sessionId = compileStreamSessionId;

    compileReconnectAttempts.value = 0;
    compileSseLogSeen.value = false;

    if (preferCompileLongPoll) {
      startCompileLongPoll(jobId);
      return;
    }

    const streamUrl = buildStreamUrl(`api/jobs/${jobId}/stream`);
    compileStreamSource = new EventSource(streamUrl, { withCredentials: true });
    compileIsReconnecting.value = false;

    compileStreamSource.addEventListener("log", (event) => {
      if (sessionId !== compileStreamSessionId) return;
      compileSseLogSeen.value = true;
      stopCompileLongPoll();
      appendCompileLogLine(event.data || "");
    });

    compileStreamSource.addEventListener("done", async (event) => {
      if (sessionId !== compileStreamSessionId) return;
      stopCompileStream();
      try {
        const payload = JSON.parse(event.data || "{}");
        updateCompileJob(payload);
      } catch {
        // ignore parse errors
      }
      await fetchCompileJobStatus(jobId);
    });

    compileStreamSource.onerror = async () => {
      if (sessionId !== compileStreamSessionId) return;
      stopCompileStream();
      if (!backendJobIsActive.value) return;
      compileReconnectAttempts.value += 1;
      if (!compileSseLogSeen.value && compileReconnectAttempts.value >= 2) {
        startCompileLongPoll(jobId);
        return;
      }
      if (compileReconnectAttempts.value > compileMaxReconnectAttempts) {
        compileJobError.value = "Log stream disconnected. Check network/proxy path.";
        return;
      }
      compileIsReconnecting.value = true;
      await fetchCompileJobStatus(jobId);
      if (sessionId !== compileStreamSessionId) return;
      if (!backendJobIsActive.value) {
        compileIsReconnecting.value = false;
        return;
      }
      compileReconnectTimer = setTimeout(() => {
        if (sessionId !== compileStreamSessionId) return;
        if (backendJobIsActive.value) {
          startCompileStream(jobId);
        }
      }, 1500);
    };

    compileTailStartTimer = setTimeout(() => {
      if (sessionId !== compileStreamSessionId) return;
      if (!compileSseLogSeen.value && backendJobIsActive.value) {
        startCompileLongPoll(jobId);
      }
    }, 2000);
  };

  const cancelActiveJobIfRunning = async () => {
    if (!canCancelCompile.value) return;
    try {
      const response = await addonFetch(`api/jobs/${compileJobId.value}/cancel`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response, "Cancel failed"));
      }
      await fetchCompileJobStatus(compileJobId.value);
    } catch {
      // close action should not be blocked by cancel errors
    }
  };

  const closeCompileModal = async () => {
    if (!canCloseCompile.value) return;
    await cancelActiveJobIfRunning();
    stopCompileStream();
    stopCompileLongPoll();
    stopCompileStatusPoll();
    compileModalOpen.value = false;
    consoleSessionTitle.value = "";
    compileJobId.value = "";
    backendJobState.value = "";
    compileJobState.value = "";
    compileJobError.value = "";
    resetCompileConsole();
    localFlashRunning.value = false;
    resetInstallPlan();
  };

  const toggleCompileAutoscroll = () => {
    compileAutoScroll.value = !compileAutoScroll.value;
    if (compileAutoScroll.value) {
      nextTick(scrollCompileToBottom);
    }
  };

  const startInstallJob = async ({ action, device = "", resetConsole = true, introLine = "" }) => {
    if (!canInstall.value || compileIsActive.value || localFlashRunning.value) return;
    const yamlName = getYamlName();
    if (!yamlName) return;

    if (action === "logs") {
      consoleSessionTitle.value = "Logs Console";
    } else if (action === "ota") {
      consoleSessionTitle.value = "OTA Console";
    } else if (installPlanMode.value === "serial") {
      consoleSessionTitle.value = "WebSerial Console";
    } else {
      consoleSessionTitle.value = "Compile Console";
    }

    compileModalOpen.value = true;
    compileAutoScroll.value = true;
    compileJobId.value = "";
    backendJobState.value = "queued";
    compileJobState.value = "queued";
    compileJobError.value = "";
    compileActiveAction.value = action;
    compileTailCheckpoint.value = 0;
    compileReconnectAttempts.value = 0;
    compileSseLogSeen.value = false;
    if (resetConsole) {
      resetCompileConsole();
    }
    if (introLine) {
      appendCompileLogLine(introLine);
    }

    const requiresPreparation = action !== "logs";
    if (requiresPreparation && typeof options.prepareBeforeJob === "function") {
      appendCompileLogLine("INFO Preparing project and device registration...");
      try {
        const ready = await options.prepareBeforeJob({ action });
        if (!ready) {
          throw new Error("Install preparation did not complete.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Install preparation failed";
        compileJobState.value = "failed";
        backendJobState.value = "failed";
        compileJobError.value = message;
        appendCompileLogLine(`ERROR ${message}`);
        resetInstallPlan();
        return;
      }
    }

    try {
      const response = await addonFetch("api/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          yaml: yamlName,
          action,
          ...(device ? { device } : {})
        })
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response, `${action.toUpperCase()} start failed`));
      }

      const payload = await response.json();
      const responseJob = payload?.job && typeof payload.job === "object" ? payload.job : null;
      compileJobId.value = responseJob?.id || payload?.job_id || "";
      const initialState = responseJob?.state || payload?.state || "queued";
      backendJobState.value = initialState;
      compileJobState.value = initialState;
      compileJobError.value = "";

      if (!compileJobId.value) {
        throw new Error("Missing job id");
      }

      startCompileStatusPoll(compileJobId.value);
      startCompileStream(compileJobId.value);
    } catch (error) {
      backendJobState.value = "failed";
      compileJobState.value = "failed";
      compileJobError.value = error instanceof Error ? error.message : `${action.toUpperCase()} start failed`;
      appendCompileLogLine(`ERROR ${compileJobError.value}`);
      resetInstallPlan();
    }
  };

  const runLocalFlashWithSelectedPort = async () => {
    const port = installPlanSerialPort.value;
    if (!port) {
      throw new Error("Serial port is not selected.");
    }

    localFlashRunning.value = true;
    backendJobState.value = "success";
    compileJobState.value = "running";
    compileActiveAction.value = "flash";
    compileJobError.value = "";
    let transport = null;
    try {
      appendCompileLogLine("INFO Downloading factory firmware from add-on...");
      const response = await addonFetch(
        `api/firmware?yaml=${encodeURIComponent(getYamlName())}&variant=factory`
      );
      if (response.status === 404) {
        throw new Error("Factory firmware not found. Compile project first.");
      }
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response, "Firmware download failed"));
      }
      const firmwareData = await response.arrayBuffer();
      const firmwareBytes = new Uint8Array(firmwareData);
      if (!firmwareBytes.byteLength) {
        throw new Error("Downloaded firmware is empty.");
      }

      appendCompileLogLine("INFO Starting flash...");
      transport = new Transport(port);
      if (!transport.device) {
        transport.device = port;
      }
      const terminal = {
        clean: () => {},
        write: (data) => appendCompileLogLine(data?.toString?.() || String(data)),
        writeLine: (data) => appendCompileLogLine(data?.toString?.() || String(data))
      };
      const loader = new ESPLoader({
        transport,
        baudrate: 921600,
        terminal
      });
      const firmwareString = loader.ui8ToBstr
        ? loader.ui8ToBstr(firmwareBytes)
        : String.fromCharCode(...firmwareBytes);
      await loader.main();
      await loader.writeFlash({
        fileArray: [
          {
            data: firmwareString,
            address: 0x0
          }
        ],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true
      });
      compileJobState.value = "success";
      appendCompileLogLine("INFO Flash completed successfully.");
    } catch (error) {
      compileJobState.value = "failed";
      compileJobError.value = error instanceof Error ? error.message : "Flash failed";
      appendCompileLogLine(`ERROR ${compileJobError.value}`);
    } finally {
      if (transport) {
        try {
          await transport.disconnect();
        } catch {
          // ignore disconnect errors
        }
      }
      localFlashRunning.value = false;
      resetInstallPlan();
    }
  };

  const handleTerminalActionFinished = async (finalState, finishedAction) => {
    stopCompileStream();
    stopCompileLongPoll();
    stopCompileStatusPoll();

    if (finalState !== "success") {
      if (finishedAction === "compile") {
        resetInstallPlan();
      }
      compileActiveAction.value = "";
      return;
    }

    if (finishedAction === "compile") {
      if (installPlanMode.value === "serial") {
        compileActiveAction.value = "flash";
        compileJobState.value = "running";
        appendCompileLogLine("INFO Compile successful. Starting serial flash...");
        await runLocalFlashWithSelectedPort();
        return;
      }
      if (installPlanMode.value === "download") {
        installPlanDownloadReady.value = true;
        appendCompileLogLine("INFO Compile successful. Use Download button to get firmware.");
        compileActiveAction.value = "";
        return;
      }
    }

    if (finishedAction === "ota" || finishedAction === "flash") {
      resetInstallPlan();
    }
    compileActiveAction.value = "";
  };

  watch(
    () => backendJobState.value,
    async (nextState, prevState) => {
      if (nextState === prevState) return;
      if (!["success", "failed", "canceled"].includes(nextState)) return;
      const actionFinished = compileActiveAction.value;
      if (!actionFinished || actionFinished === "flash") return;
      await handleTerminalActionFinished(nextState, actionFinished);
    }
  );

  watch(
    () => compileJobState.value,
    async (nextState, prevState) => {
      if (nextState === prevState) return;
      if (!["success", "failed", "canceled"].includes(nextState)) return;
      if (compileIsActive.value) return;
      if (compileActiveAction.value !== "flash") return;
      await handleTerminalActionFinished(nextState, "flash");
    }
  );

  const prepareSerialInstall = async () => {
    if (!canInstall.value || compileIsActive.value || localFlashRunning.value) return;
    if (!serialSupported.value) {
      setError("Your browser does not support Web Serial.");
      return;
    }
    if (!serialSecure.value) {
      setError("Web Serial requires HTTPS or localhost.");
      return;
    }
    if (!serialPolicyAllowed.value) {
      setError("Web Serial is blocked by Permissions-Policy.");
      return;
    }

    let port = null;
    try {
      port = await navigator.serial.requestPort();
    } catch (error) {
      if (error?.name === "NotFoundError") {
        return;
      }
      setError(error instanceof Error ? error.message : "Port selection failed");
      return;
    }

    installPlanMode.value = "serial";
    installPlanSerialPort.value = port;
    installPlanDownloadReady.value = false;
    await startInstallJob({
      action: "compile",
      introLine: `INFO Selected serial port. Starting compile for ${getYamlName()}`
    });
  };

  const downloadBinary = async () => {
    clearError();
    try {
      const yamlName = getYamlName();
      const response = await addonFetch(`api/firmware?yaml=${encodeURIComponent(yamlName)}&variant=factory`);
      if (response.status === 404) {
        throw new Error("Factory firmware not found. Compile project first.");
      }
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response, "Firmware download failed"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = yamlName.replace(/\.yaml$/i, ".bin");
      anchor.click();
      URL.revokeObjectURL(url);
      appendCompileLogLine("INFO Firmware download started.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firmware download failed";
      if (compileModalOpen.value) {
        compileJobError.value = message;
        appendCompileLogLine(`ERROR ${message}`);
      } else {
        setError(message);
      }
    }
  };

  const handleInstallSerialPort = async () => {
    await prepareSerialInstall();
  };

  const handleInstallOta = async () => {
    const device = getDeviceHost();
    if (!device || !canUseOta.value) {
      setError("Device must be online for OTA install.");
      return;
    }
    await startInstallJob({
      action: "ota",
      device: device.trim(),
      introLine: `INFO Starting OTA install for ${getYamlName()}`
    });
  };

  const startLogs = async () => {
    if (!canLogs.value) return;
    const device = getDeviceHost();
    if (!device) {
      setError("No device host found for logs.");
      return;
    }
    resetInstallPlan();
    await startInstallJob({
      action: "logs",
      device,
      introLine: `INFO Starting logs for ${getYamlName()}`
    });
  };

  const handleInstallDownload = async () => {
    installPlanMode.value = "download";
    installPlanDownloadReady.value = false;
    await startInstallJob({
      action: "compile",
      introLine: `INFO Starting compile before firmware download for ${getYamlName()}`
    });
  };

  const dispose = () => {
    stopCompileStream();
    stopCompileLongPoll();
    stopCompileStatusPoll();
    clearCompileLogQueue();
  };

  onBeforeUnmount(() => {
    dispose();
  });

  return {
    compileModalOpen,
    setCompileConsoleElement,
    compileAutoScroll,
    compileJobState,
    compileLogLines,
    compileIsReconnecting,
    installPlanDownloadReady,
    localFlashRunning,
    compileIsActive,
    canDownloadCompiledBinary,
    canCloseCompile,
    terminalTitle,
    compileStateLabel,
    compileStateClass,
    toggleCompileAutoscroll,
    closeCompileModal,
    handleInstallSerialPort,
    handleInstallOta,
    startLogs,
    handleInstallDownload,
    downloadBinary,
    dispose
  };
};
