<template>
  <section class="diagnostics-view">
    <div class="diagnostics-heading">
      <div>
        <p class="diagnostics-kicker">Runtime health</p>
        <h1>Diagnostics</h1>
        <p class="diagnostics-intro">
          Passive checks for storage, pinned tools, cache compatibility, and device connectivity.
          No compile, upload, or log session is started.
        </p>
      </div>
      <div class="diagnostics-controls">
        <label for="diagnostic-device">Device checks</label>
        <select id="diagnostic-device" v-model="selectedYaml" :disabled="loading" @change="refreshDiagnostics">
          <option value="">Runtime only</option>
          <option v-for="device in devices" :key="device.selector" :value="device.selector">
            {{ device.name }}{{ device.host ? ` (${device.host})` : "" }}
          </option>
        </select>
        <button type="button" class="btn-standard" :disabled="loading" @click="refreshDiagnostics">
          {{ loading ? "Checking..." : "Run checks" }}
        </button>
      </div>
    </div>

    <div v-if="requestError" class="diagnostics-request-error" role="alert">
      <strong>Diagnostics could not run.</strong>
      <span>{{ requestError }}</span>
      <span>Check the backend connection and authentication, then retry.</span>
    </div>

    <div v-else-if="diagnostics" class="diagnostics-summary" :class="`is-${diagnostics.overall}`">
      <span class="diagnostics-summary-state">{{ statusLabel(diagnostics.overall) }}</span>
      <span>{{ summaryText }}</span>
      <span class="diagnostics-summary-meta">{{ diagnostics.mode }} runtime</span>
    </div>

    <div class="diagnostics-groups">
      <article v-for="group in groups" :key="group.id" class="diagnostics-group">
        <header>
          <span>{{ group.index }}</span>
          <div>
            <h2>{{ group.label }}</h2>
            <p>{{ group.description }}</p>
          </div>
        </header>
        <div class="diagnostics-checks">
          <div v-for="check in groupedChecks[group.id]" :key="check.id" class="diagnostics-check">
            <span class="diagnostics-status" :class="`is-${check.status}`">{{ statusLabel(check.status) }}</span>
            <div>
              <h3>{{ check.label }}</h3>
              <p>{{ check.summary }}</p>
              <p v-if="check.action" class="diagnostics-action"><strong>Action:</strong> {{ check.action }}</p>
              <p v-if="detailText(check)" class="diagnostics-detail">{{ detailText(check) }}</p>
            </div>
          </div>
          <p v-if="!groupedChecks[group.id].length" class="diagnostics-empty">
            {{ loading ? "Running checks..." : "No results available." }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { loadRuntimeDiagnostics } from "../utils/runtimeDiagnostics";

const groups = [
  { id: "storage", index: "01", label: "Writable storage", description: "Workspace and mutable runtime roots." },
  { id: "runtime", index: "02", label: "Pinned runtime", description: "ESPHome, PlatformIO, and cache manifests." },
  { id: "network", index: "03", label: "Device path", description: "Bounded DNS, mDNS, OTA, and logs probes." }
];
const devices = ref([]);
const selectedYaml = ref("");
const diagnostics = ref(null);
const loading = ref(false);
const requestError = ref("");

const groupedChecks = computed(() => {
  const result = { storage: [], runtime: [], network: [] };
  for (const check of diagnostics.value?.checks || []) {
    if (result[check.group]) result[check.group].push(check);
  }
  return result;
});

const summaryText = computed(() => {
  if (!diagnostics.value) return "";
  const counts = diagnostics.value.checks.reduce((result, check) => {
    result[check.status] = (result[check.status] || 0) + 1;
    return result;
  }, {});
  if (counts.error) return `${counts.error} check${counts.error === 1 ? "" : "s"} require attention.`;
  if (counts.warning) return `${counts.warning} warning${counts.warning === 1 ? "" : "s"} should be reviewed.`;
  return "All applicable checks passed.";
});

const statusLabel = (status) => ({
  ok: "OK",
  warning: "Warning",
  error: "Error",
  unavailable: "Unavailable",
  not_applicable: "Not applicable"
}[status] || "Error");

const detailText = (check) => {
  const details = check?.details || {};
  if (details.expectedVersion) {
    return `Expected ${details.expectedVersion}; detected ${details.actualVersion || "unknown"}.`;
  }
  if (Number.isInteger(details.platforms) || Number.isInteger(details.packages)) {
    return `${details.platforms || 0} platform descriptors, ${details.packages || 0} package descriptors.`;
  }
  return "";
};

const refreshDiagnostics = async () => {
  loading.value = true;
  requestError.value = "";
  diagnostics.value = null;
  try {
    diagnostics.value = await loadRuntimeDiagnostics({ selector: selectedYaml.value });
    devices.value = diagnostics.value.devices
      .filter((device) => typeof device.name === "string" && device.name)
      .map((device) => ({
        yaml: device.yaml,
        name: typeof device.name === "string" && device.name ? device.name : device.yaml,
        host: typeof device.host === "string" ? device.host : "",
        selector: typeof device.yaml === "string" && device.yaml
          ? `yaml:${device.yaml}`
          : `name:${device.name}`
      }));
    if (diagnostics.value.error) requestError.value = diagnostics.value.error;
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : "Unknown diagnostics error.";
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await refreshDiagnostics();
});
</script>

<style scoped>
.diagnostics-view {
  height: 100%;
  overflow: auto;
  padding: 30px clamp(18px, 4vw, 58px) 44px;
  background: #f3f6fa;
}

.diagnostics-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  gap: 32px;
  align-items: end;
  max-width: 1280px;
  margin: 0 auto 24px;
  padding: 28px;
  color: #eef5ff;
  background: #10233f;
  border-left: 6px solid #4d9cd6;
}

.diagnostics-kicker {
  margin: 0 0 8px;
  color: #83c9f4;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.diagnostics-heading h1 { margin: 0 0 8px; font-size: clamp(30px, 5vw, 48px); }
.diagnostics-intro { max-width: 720px; margin: 0; color: #b9c9dc; line-height: 1.55; }
.diagnostics-controls { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.diagnostics-controls label { grid-column: 1 / -1; color: #dce9f7; }
.diagnostics-controls select { min-width: 0; background: #fff; }

.diagnostics-summary,
.diagnostics-request-error {
  display: flex;
  gap: 14px;
  align-items: center;
  max-width: 1280px;
  margin: 0 auto 18px;
  padding: 12px 16px;
  border: 1px solid #b8c9db;
  background: #fff;
}
.diagnostics-summary.is-ok { border-left: 5px solid #18845b; }
.diagnostics-summary.is-warning { border-left: 5px solid #c47b08; }
.diagnostics-summary.is-error,
.diagnostics-request-error { border-left: 5px solid #c33c3c; }
.diagnostics-summary-state { font-weight: 800; text-transform: uppercase; }
.diagnostics-summary-meta { margin-left: auto; color: #64748b; font-size: 12px; }
.diagnostics-request-error { align-items: flex-start; flex-direction: column; gap: 4px; }

.diagnostics-groups { display: grid; gap: 16px; max-width: 1280px; margin: 0 auto; }
.diagnostics-group { display: grid; grid-template-columns: 250px minmax(0, 1fr); border: 1px solid #d6e0eb; background: #fff; }
.diagnostics-group > header { display: flex; gap: 16px; padding: 22px; border-right: 1px solid #d6e0eb; background: #e8eef5; }
.diagnostics-group > header > span { color: #5682aa; font-family: "Courier New", monospace; font-weight: 800; }
.diagnostics-group h2 { margin: 0 0 6px; font-size: 17px; }
.diagnostics-group header p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.5; }
.diagnostics-checks { display: grid; }
.diagnostics-check { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 18px 22px; border-bottom: 1px solid #e4eaf1; }
.diagnostics-check:last-child { border-bottom: 0; }
.diagnostics-check h3 { margin: 0 0 4px; font-size: 14px; }
.diagnostics-check p { margin: 0; color: #475569; font-size: 13px; line-height: 1.45; }
.diagnostics-action { margin-top: 7px !important; color: #7c4a03 !important; }
.diagnostics-detail { margin-top: 5px !important; color: #64748b !important; font-family: "Courier New", monospace; font-size: 11px !important; }
.diagnostics-status { align-self: start; padding: 4px 7px; border: 1px solid currentColor; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-align: center; text-transform: uppercase; }
.diagnostics-status.is-ok { color: #14734f; background: #effaf5; }
.diagnostics-status.is-warning { color: #9a5d00; background: #fff8e8; }
.diagnostics-status.is-error { color: #b52f35; background: #fff1f1; }
.diagnostics-status.is-unavailable,
.diagnostics-status.is-not_applicable { color: #64748b; background: #f1f5f9; }
.diagnostics-empty { padding: 22px; color: #64748b; }

@media (max-width: 780px) {
  .diagnostics-view { padding: 14px; }
  .diagnostics-heading { grid-template-columns: 1fr; padding: 22px; }
  .diagnostics-group { grid-template-columns: 1fr; }
  .diagnostics-group > header { border-right: 0; border-bottom: 1px solid #d6e0eb; }
  .diagnostics-check { grid-template-columns: 1fr; gap: 9px; }
  .diagnostics-status { justify-self: start; }
  .diagnostics-summary { align-items: flex-start; flex-direction: column; gap: 5px; }
  .diagnostics-summary-meta { margin-left: 0; }
}
</style>
