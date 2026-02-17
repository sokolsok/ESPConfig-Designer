<template>
  <div v-if="compileOpen" class="compile-modal-overlay">
    <div class="compile-modal" role="dialog" aria-modal="true" :aria-label="terminalTitle">
      <div class="compile-modal-header">
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
      </div>

      <div class="compile-modal-body">
        <section class="compile-log-panel" aria-label="Console log output">
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
  canDownloadCompiledBinary: { type: Boolean, required: true },
  canCloseCompile: { type: Boolean, required: true },
  onConsoleRef: { type: Function, default: null }
});

const emit = defineEmits([
  "toggle-autoscroll",
  "download",
  "close-compile"
]);

const setConsoleRef = (element) => {
  if (typeof props.onConsoleRef === "function") {
    props.onConsoleRef(element);
  }
};
</script>
