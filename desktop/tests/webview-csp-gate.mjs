import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing ${name}`);
  }
  return process.argv[index + 1];
}

const debugPort = Number.parseInt(argument("--debug-port"), 10);
const backendPort = Number.parseInt(argument("--backend-port"), 10);
assert.ok(Number.isInteger(debugPort) && debugPort > 0, "Invalid CDP debug port");
assert.ok(Number.isInteger(backendPort) && backendPort > 0, "Invalid backend port");

const pageUrl = `http://127.0.0.1:${backendPort}/`;

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(
          (candidate) => candidate.type === "page" && candidate.url.startsWith(pageUrl),
        );
        if (target?.webSocketDebuggerUrl) {
          return target;
        }
      }
    } catch {
      // WebView2 exposes CDP shortly after the native window is created.
    }
    await delay(100);
  }
  throw new Error(`WebView2 CDP target did not appear on port ${debugPort}`);
}

class CdpClient {
  constructor(url) {
    this.url = url.replace("localhost", "127.0.0.1");
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket connection timed out")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP WebSocket connection failed"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      listener(message.params);
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? "WebView evaluation failed");
  }
  return response.result.value;
}

async function waitForDocument(client) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const readyState = await evaluate(client, "document.readyState");
      if (readyState === "interactive" || readyState === "complete") return;
    } catch {
      // The execution context can be replaced while the initial navigation commits.
    }
    await delay(100);
  }
  throw new Error("Initial WebView document did not finish navigation");
}

async function waitForApplication(client) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      "document.readyState === 'complete' && document.querySelector('#app')?.children.length > 0",
    );
    if (ready) return;
    await delay(100);
  }
  throw new Error("Frontend did not mount in the WebView");
}

const target = await waitForTarget();
const client = new CdpClient(target.webSocketDebuggerUrl);
let documentCsp = "";

try {
  await client.connect();
  client.on("Network.responseReceived", ({ response, type }) => {
    if (type === "Document" && response.url.startsWith(pageUrl)) {
      const headerName = Object.keys(response.headers).find(
        (name) => name.toLowerCase() === "content-security-policy",
      );
      documentCsp = headerName ? response.headers[headerName] : "";
    }
  });
  await client.send("Network.enable");
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await waitForDocument(client);
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__ecdCspViolations = [];
      addEventListener("securitypolicyviolation", (event) => {
        window.__ecdCspViolations.push({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
          originalPolicy: event.originalPolicy
        });
      });
    `,
  });
  await client.send("Page.reload", { ignoreCache: true });
  await waitForApplication(client);
  await delay(2_000);

  assert.ok(documentCsp, "The WebView main document did not receive a CSP response header");
  assert.ok(documentCsp.includes("script-src 'self'"), "The effective CSP does not restrict scripts to self");
  assert.ok(!documentCsp.includes("unsafe-eval"), "The effective CSP permits unsafe-eval");
  assert.ok(!documentCsp.includes(" *"), "The effective CSP contains a wildcard source");

  const flow = await evaluate(client, `
    (async () => {
      const health = await fetch("/api/health", { credentials: "include" });
      const healthPayload = await health.json();
      const localScript = document.querySelector('script[type="module"]')?.src;
      const localAsset = localScript ? await fetch(localScript) : null;
      const longPoll = await fetch("/api/jobs/csp-probe/tail-wait?since=0&timeout=0.1&limit=1");
      const firmware = await fetch("/api/firmware?yaml=csp-probe.yaml");
      const firmwareBlob = await firmware.blob();
      const firmwareBlobUrl = URL.createObjectURL(firmwareBlob);
      const download = document.createElement("a");
      download.href = firmwareBlobUrl;
      download.download = "csp-probe.bin";
      download.addEventListener("click", (event) => event.preventDefault(), { once: true });
      document.body.append(download);
      download.click();
      download.remove();
      URL.revokeObjectURL(firmwareBlobUrl);
      const eventSourceResult = await new Promise((resolve) => {
        const source = new EventSource("/api/jobs/csp-probe/stream", { withCredentials: true });
        const timeout = setTimeout(() => {
          source.close();
          resolve("timeout");
        }, 5000);
        source.addEventListener("done", () => {
          clearTimeout(timeout);
          source.close();
          resolve("done");
        }, { once: true });
        source.addEventListener("error", () => {
          clearTimeout(timeout);
          source.close();
          resolve("http-error");
        }, { once: true });
      });
      location.hash = "#/builder";
      await new Promise((resolve) => setTimeout(resolve, 500));
      const styleProbe = document.createElement("div");
      styleProbe.style.width = "7px";
      document.body.append(styleProbe);
      const styleWidth = styleProbe.style.width;
      styleProbe.remove();
      return {
        mode: healthPayload.mode,
        healthStatus: health.status,
        localAssetStatus: localAsset?.status ?? 0,
        longPollStatus: longPoll.status,
        firmwareStatus: firmware.status,
        firmwareBytes: firmwareBlob.size,
        firmwareDownloadName: download.download,
        eventSourceResult,
        route: location.hash,
        styleWidth,
        tauriInvokeAvailable: typeof window.__TAURI_INTERNALS__?.invoke === "function",
        externalLinkPresent: Boolean(document.querySelector('a[target="_blank"][href^="https://"]')),
        violations: window.__ecdCspViolations
      };
    })()
  `);

  assert.equal(flow.mode, "desktop", "WebView API fetch did not reach the Desktop backend");
  assert.equal(flow.healthStatus, 200, "WebView health fetch failed");
  assert.equal(flow.localAssetStatus, 200, "WebView local asset fetch failed");
  assert.equal(flow.longPollStatus, 200, "Long-poll probe did not receive the synthetic job");
  assert.equal(flow.firmwareStatus, 200, "Firmware probe did not receive the synthetic firmware");
  assert.equal(flow.firmwareBytes, 4, "Firmware response did not produce the expected blob");
  assert.equal(flow.firmwareDownloadName, "csp-probe.bin", "Firmware download name was not retained");
  assert.equal(flow.eventSourceResult, "done", "EventSource did not receive the terminal job event");
  assert.equal(flow.route, "#/builder", "Hash routing failed under CSP");
  assert.equal(flow.styleWidth, "7px", "Required dynamic style attributes were blocked");
  assert.equal(flow.tauriInvokeAvailable, true, "Tauri IPC transport is unavailable");
  assert.equal(flow.externalLinkPresent, true, "The frontend contains no HTTPS external-link target");
  assert.deepEqual(flow.violations, [], `Unexpected CSP violations: ${JSON.stringify(flow.violations)}`);

  const inlineProbe = await evaluate(client, `
    (async () => {
      window.__ecdInlineScriptRan = false;
      window.__ecdCspViolations.length = 0;
      const script = document.createElement("script");
      script.textContent = "window.__ecdInlineScriptRan = true";
      document.head.append(script);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        ran: window.__ecdInlineScriptRan,
        violations: window.__ecdCspViolations
      };
    })()
  `);
  assert.equal(inlineProbe.ran, false, "WebView executed an inline script forbidden by CSP");
  assert.ok(
    inlineProbe.violations.some((violation) => violation.effectiveDirective === "script-src-elem"),
    `WebView did not report the expected inline-script CSP violation: ${JSON.stringify(inlineProbe.violations)}`,
  );

  console.log("webview CSP gate: PASS");
} finally {
  client.close();
}
