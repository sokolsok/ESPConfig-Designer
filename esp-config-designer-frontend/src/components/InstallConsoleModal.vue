<template>
  <div v-if="compileOpen" class="compile-modal-overlay">
    <div
      class="compile-modal"
      :class="{ 'compile-modal--serial-selection': serialHaSelectionOpen }"
      role="dialog"
      aria-modal="true"
      :aria-label="terminalTitle"
    >
      <div class="compile-modal-header">
        <template v-if="serialHaSelectionOpen">
          <div class="serial-selection-heading">
            <strong>Select a serial device</strong>
            <span>Choose device connected to the server.</span>
          </div>
          <button
            type="button"
            class="btn-standard secondary serial-selection-refresh"
            :disabled="serialHaSelectionBusy"
            @click="emit('refresh-ha-serial-ports')"
          >
            Refresh
          </button>
        </template>
        <template v-else>
          <div class="compile-meta">
            <span class="compile-title">{{ terminalTitle }}</span>
            <span :class="compileStateClass">{{ compileStateLabel }}</span>
          </div>
          <div class="compile-actions">
            <span v-if="compileIsReconnecting" class="compile-reconnect">Reconnecting...</span>
            <div class="compile-scroll-lock">
              <span class="compile-scroll-lock-label">Scroll lock</span>
              <button
                type="button"
                class="compile-scroll-lock-switch"
                :class="{ 'is-on': !compileAutoScroll }"
                role="switch"
                :aria-checked="!compileAutoScroll"
                @click="emit('toggle-autoscroll')"
              >
                <span class="compile-scroll-lock-thumb" aria-hidden="true"></span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="compile-modal-body">
        <section v-if="serialHaSelectionOpen" class="serial-port-selection" aria-label="HA Server serial ports">
          <div class="serial-port-selection-content">
            <div v-if="serialHaPortsLoading" class="serial-port-selection-state">Loading serial devices...</div>
            <div v-else-if="serialHaPortsError" class="serial-port-selection-state serial-port-selection-state--error">
              {{ serialHaPortsError }}
            </div>
            <div v-else-if="!serialHaPorts.length" class="serial-port-selection-state">
              No serial devices are available on the Home Assistant server.
            </div>
            <div v-else class="serial-port-list">
              <button
                v-for="port in serialHaPorts"
                :key="port.path"
                type="button"
                class="serial-port-option"
                :disabled="serialHaSelectionBusy"
                @click="emit('select-ha-serial-port', port.path)"
              >
                <strong>{{ port.description || 'Serial device' }}</strong>
                <span>{{ port.path }}</span>
              </button>
            </div>
          </div>
        </section>
        <section v-else class="compile-log-panel" aria-label="Console log output">
          <div class="compile-log-scroll" :ref="setConsoleRef">
            <div v-for="line in compileLogLines" :key="line.id" :class="line.className" v-html="line.html"></div>
          </div>
        </section>
      </div>

      <div class="compile-modal-footer">
        <div class="compile-footer-actions">
          <button v-if="canDownloadCompiledBinary" type="button" class="btn-standard" @click="emit('download')">
            Download
          </button>
          <button type="button" class="btn-standard secondary" :disabled="!canCloseCompile" @click="emit('close-compile')">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  compileOpen: { type: Boolean, required: true },
  terminalTitle: { type: String, required: true },
  compileStateClass: { type: String, required: true },
  compileStateLabel: { type: String, required: true },
  compileIsReconnecting: { type: Boolean, required: true },
  compileAutoScroll: { type: Boolean, required: true },
  compileLogLines: { type: Array, required: true },
  serialHaSelectionOpen: { type: Boolean, default: false },
  serialHaSelectionBusy: { type: Boolean, default: false },
  serialHaPorts: { type: Array, default: () => [] },
  serialHaPortsLoading: { type: Boolean, default: false },
  serialHaPortsError: { type: String, default: "" },
  canDownloadCompiledBinary: { type: Boolean, required: true },
  canCloseCompile: { type: Boolean, required: true },
  onConsoleRef: { type: Function, default: null }
});

const emit = defineEmits([
  "toggle-autoscroll",
  "download",
  "refresh-ha-serial-ports",
  "select-ha-serial-port",
  "close-compile"
]);

const setConsoleRef = (element) => {
  if (typeof props.onConsoleRef === "function") {
    props.onConsoleRef(element);
  }
};
</script>
