<template>
  <div v-if="open" class="secrets-modal-overlay" @click.self="emit('close')">
    <section class="secrets-modal" role="dialog" aria-modal="true" aria-label="Secrets">
      <header class="secrets-modal-header">
        <h3>Secrets</h3>
      </header>

      <div class="secrets-modal-body">
        <div class="secrets-modal-editor-shell">
          <pre ref="highlightRef" class="secrets-modal-highlight" aria-hidden="true" v-html="highlightedContent"></pre>
          <textarea
            ref="editorRef"
            v-model="draft"
            class="secrets-modal-editor"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            placeholder="# secrets.yaml\n# key: value"
            :disabled="loading || saving"
            @scroll="syncHighlightScroll"
          ></textarea>
        </div>
      </div>

      <p v-if="effectiveError" class="secrets-modal-error">{{ effectiveError }}</p>

      <footer class="secrets-modal-footer">
        <button type="button" class="btn-standard" :disabled="!canSave" @click="emit('save', draft)">
          Save
        </button>
        <button type="button" class="btn-standard secondary" :disabled="saving" @click="emit('close')">
          Close
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { load as parseYaml } from "js-yaml";

const props = defineProps({
  open: { type: Boolean, default: false },
  content: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" }
});

const emit = defineEmits(["close", "save"]);

const draft = ref("");
const baseline = ref("");
const syntaxError = ref("");
const editorRef = ref(null);
const highlightRef = ref(null);

const isDirty = computed(() => draft.value !== baseline.value);
const canSave = computed(
  () => isDirty.value && !props.loading && !props.saving && !syntaxError.value
);
const effectiveError = computed(() => syntaxError.value || props.error || "");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightLine = (line) => {
  if (/^\s*#/.test(line)) {
    return `<span class="yaml-comment">${escapeHtml(line)}</span>`;
  }
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) return escapeHtml(line);
  const keyPart = line.slice(0, colonIndex + 1);
  const rest = line.slice(colonIndex + 1);
  const commentIndex = rest.indexOf("#");
  if (commentIndex < 0) {
    return `${escapeHtml(keyPart)}<span class="yaml-value">${escapeHtml(rest)}</span>`;
  }
  const valuePart = rest.slice(0, commentIndex);
  const commentPart = rest.slice(commentIndex);
  return `${escapeHtml(keyPart)}<span class="yaml-value">${escapeHtml(valuePart)}</span><span class="yaml-comment">${escapeHtml(commentPart)}</span>`;
};

const highlightedContent = computed(() => {
  const lines = String(draft.value || "").split("\n");
  return lines.map((line) => highlightLine(line)).join("\n");
});

const formatYamlError = (error) => {
  const message = error?.message || "Invalid YAML syntax";
  const mark = error?.mark;
  if (!mark || !Number.isFinite(mark.line) || !Number.isFinite(mark.column)) {
    return message;
  }
  return `${message} (line ${mark.line + 1}, column ${mark.column + 1})`;
};

const validateDraft = () => {
  try {
    parseYaml(draft.value || "");
    syntaxError.value = "";
  } catch (error) {
    syntaxError.value = formatYamlError(error);
  }
};

const syncHighlightScroll = () => {
  const editor = editorRef.value;
  const highlight = highlightRef.value;
  if (!editor || !highlight) return;
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
};

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    draft.value = props.content || "";
    baseline.value = props.content || "";
    validateDraft();
  }
);

watch(
  () => props.content,
  (value) => {
    if (!props.open) return;
    const next = value || "";
    if (isDirty.value && draft.value !== next) return;
    draft.value = next;
    baseline.value = next;
    validateDraft();
  }
);

watch(
  () => draft.value,
  () => {
    validateDraft();
  }
);
</script>

<style scoped>
.secrets-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 1350;
}

.secrets-modal {
  width: min(760px, 92vw);
  height: min(520px, 88vh);
  background: #fcfcfc;
  border: 1px solid #dbe2ee;
  border-radius: 4px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  overflow: hidden;
}

.secrets-modal-header {
  padding: 12px 14px;
  background: #fcfcfc;
}

.secrets-modal-header h3 {
  margin: 0;
}

.secrets-modal-body {
  min-height: 0;
  padding: 0 14px;
}

.secrets-modal-editor-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.secrets-modal-highlight,
.secrets-modal-editor {
  position: absolute;
  inset: 0;
  border: 1px solid #d1d9e6;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.35;
  padding: 10px;
  box-sizing: border-box;
  overflow: auto;
  white-space: pre;
  tab-size: 8;
}

.secrets-modal-highlight {
  margin: 0;
  pointer-events: none;
  background: #101729;
  color: #e2e8f0;
}

.secrets-modal-editor {
  resize: none;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: #e2e8f0;
  text-shadow: none;
}

.secrets-modal-editor:focus,
.secrets-modal-editor:focus-visible {
  outline: none;
  border-color: #d1d9e6;
  box-shadow: none;
}

:deep(.yaml-comment) {
  color: #41783f;
}

:deep(.yaml-value) {
  color: #a67146;
}

.secrets-modal-error {
  margin: 0;
  padding: 8px 14px 0;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
}

.secrets-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 14px;
  background: #fcfcfc;
}
</style>
