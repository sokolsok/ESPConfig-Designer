<template>
  <div v-if="open" class="yaml-import-overlay" @click.self="emit('cancel')">
    <section class="yaml-import-modal" role="dialog" aria-modal="true" aria-label="Importing from YAML file">
      <header class="yaml-import-header">
        <div>
          <h3>Importing from YAML file</h3>
          <p>{{ fileName || "Selected YAML file" }}</p>
        </div>
      </header>

      <div class="yaml-import-body">
        <div v-if="reportVisible && analysisError" class="yaml-import-report yaml-import-report--error">
          <h4>YAML parse failed</h4>
          <p>{{ analysisError.message }}</p>
          <p v-if="analysisError.line || analysisError.column" class="yaml-import-report__meta">
            Line {{ analysisError.line || "?" }}, column {{ analysisError.column || "?" }}
          </p>
        </div>

        <div v-else-if="reportVisible && analysis" class="yaml-import-report">
          <h4>YAML parsed successfully</h4>
          <div class="yaml-import-summary" aria-label="YAML analysis summary">
            <div>
              <strong>{{ analysis.summary?.recognized || 0 }}</strong>
              <span>Recognized</span>
            </div>
            <div>
              <strong>{{ analysis.summary?.components || 0 }}</strong>
              <span>Component domains</span>
            </div>
            <div>
              <strong>{{ analysis.summary?.unsupported || 0 }}</strong>
              <span>Unsupported</span>
            </div>
            <div>
              <strong>{{ analysis.summary?.warnings || 0 }}</strong>
              <span>Warnings</span>
            </div>
            <div>
              <strong>{{ analysis.componentSummary?.matched || 0 }}</strong>
              <span>Matched components</span>
            </div>
            <div>
              <strong>{{ analysis.componentSummary?.unmatched || 0 }}</strong>
              <span>Unmatched components</span>
            </div>
            <div>
              <strong>{{ analysis.mappingSummary?.mapped || 0 }}</strong>
              <span>Schema mapped</span>
            </div>
            <div>
              <strong>{{ analysis.mappingSummary?.partial || 0 }}</strong>
              <span>Schema partial</span>
            </div>
            <div>
              <strong>{{ analysis.mappingSummary?.unmappedFields || 0 }}</strong>
              <span>Unmapped fields</span>
            </div>
            <div>
              <strong>{{ analysis.mappingSummary?.schemaError || 0 }}</strong>
              <span>Schema errors</span>
            </div>
            <div>
              <strong>{{ analysis.importReport?.summary?.dropped || 0 }}</strong>
              <span>Dropped</span>
            </div>
          </div>

          <div v-if="analysis.importReport" class="yaml-import-project-report">
            <h5>Project import preview</h5>
            <p>
              Project: <strong>{{ analysis.generatedProjectName }}</strong>
              <span aria-hidden="true"> · </span>
              YAML: <strong>{{ analysis.generatedYamlName }}</strong>
            </p>
            <div class="yaml-import-project-report__summary">
              <span>Mapped: {{ analysis.importReport.summary?.mapped || 0 }}</span>
              <span>Partial: {{ analysis.importReport.summary?.partial || 0 }}</span>
              <span>Dropped: {{ analysis.importReport.summary?.dropped || 0 }}</span>
              <span>Warnings: {{ analysis.importReport.summary?.warnings || 0 }}</span>
            </div>
            <p v-if="analysis.importReport.summary?.dropped" class="yaml-import-project-report__dropped">
              These lines will not be imported in this version.
            </p>
          </div>

          <p v-if="importError" class="yaml-import-import-error">{{ importError }}</p>

          <div v-if="analysis.warnings?.length" class="yaml-import-warnings">
            <h5>Warnings</h5>
            <ul>
              <li v-for="(warning, index) in analysis.warnings" :key="`warning-${index}`">
                {{ warning.message }}
              </li>
            </ul>
          </div>

          <div class="yaml-import-section-list">
            <div v-for="section in analysis.sections" :key="section.key" class="yaml-import-section-row">
              <span class="yaml-import-section-key">{{ section.key }}</span>
              <span class="yaml-import-section-kind" :class="`yaml-import-section-kind--${section.status}`">
                {{ section.kind }}
              </span>
              <span class="yaml-import-section-message">{{ section.message }}</span>
            </div>
            <p v-if="!analysis.sections?.length" class="yaml-import-empty">No top-level YAML sections found.</p>
          </div>

          <div v-if="analysis.components?.length" class="yaml-import-components">
            <h5>Detected Components</h5>
            <div class="yaml-import-component-list">
              <div
                v-for="component in analysis.components"
                :key="component.path"
                class="yaml-import-component-row"
              >
                <span class="yaml-import-component-path">{{ component.path }}</span>
                <span
                  class="yaml-import-component-status"
                  :class="`yaml-import-component-status--${component.status}`"
                >
                  {{ component.status }}
                </span>
                <span class="yaml-import-component-target">
                  {{ component.componentId || component.message }}
                </span>
                <span
                  class="yaml-import-component-status"
                  :class="`yaml-import-component-status--${component.mappingStatus || 'not_mapped'}`"
                >
                  {{ component.mappingStatus || "not mapped" }}
                </span>
                <span class="yaml-import-component-schema">
                  {{ component.schemaPathAvailable ? component.schemaPath : "No schema path" }}
                </span>
                <span class="yaml-import-component-message">
                  {{ component.message }}
                  <small v-if="component.mappableKeys?.length">Mappable: {{ formatKeyList(component.mappableKeys) }}</small>
                  <small v-if="component.mappedKeys?.length">Mapped: {{ formatKeyList(component.mappedKeys) }}</small>
                  <small v-if="component.unmappedKeys?.length">Unmapped: {{ formatKeyList(component.unmappedKeys) }}</small>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="yaml-import-preview-wrap">
          <div class="yaml-import-preview-status" :class="previewStatusClass">
            {{ previewStatusLabel }}
          </div>
          <div class="yaml-import-preview" aria-label="YAML preview">
            <div
              v-for="line in annotatedLines"
              :key="line.number"
              class="yaml-import-preview-line"
              :class="`yaml-import-preview-line--${line.status}`"
              :title="line.message"
            >
              <span class="yaml-import-preview-line-number">{{ line.number }}</span>
              <span class="yaml-import-preview-line-text">{{ line.text || " " }}</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="yaml-import-footer">
        <button type="button" class="btn-standard secondary" @click="emit('cancel')">
          {{ reportVisible ? "Close" : "Cancel" }}
        </button>
        <button
          v-if="!reportVisible"
          type="button"
          class="btn-standard"
          :disabled="!content || analyzing || (!analysis && !analysisError)"
          @click="emit('continue')"
        >
          {{ analyzing ? "Analyzing..." : "Continue" }}
        </button>
        <button
          v-else-if="analysis && !analysisError"
          type="button"
          class="btn-standard"
          :disabled="importing || !analysis.projectData"
          @click="emit('confirm-import')"
        >
          {{ importing ? "Importing..." : "Import project" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { annotateYamlImportLines } from "../../utils/yamlImportLineAnnotations";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  fileName: {
    type: String,
    default: ""
  },
  content: {
    type: String,
    default: ""
  },
  analysis: {
    type: Object,
    default: null
  },
  analysisError: {
    type: Object,
    default: null
  },
  analyzing: {
    type: Boolean,
    default: false
  },
  reportVisible: {
    type: Boolean,
    default: false
  },
  importing: {
    type: Boolean,
    default: false
  },
  importError: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["cancel", "continue", "confirm-import"]);

const formatKeyList = (keys) => (Array.isArray(keys) ? keys.join(", ") : "");

const annotatedLines = computed(() =>
  annotateYamlImportLines({
    yamlText: props.content,
    analysis: props.analysis,
    analysisError: props.analysisError
  })
);

const previewStatusLabel = computed(() => {
  if (props.analyzing) return "Analyzing YAML in the background...";
  if (props.analysisError) return "YAML parse failed. Continue to see details.";
  if (props.analysis) return "Analysis completed. Green lines will be imported; red lines will not be imported in this version.";
  return "Waiting for analysis.";
});

const previewStatusClass = computed(() => {
  if (props.analysisError) return "yaml-import-preview-status--error";
  if (props.analysis) return "yaml-import-preview-status--ready";
  return "yaml-import-preview-status--working";
});
</script>

<style scoped>
.yaml-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.55);
}

.yaml-import-modal {
  width: min(1380px, calc(100vw - 48px));
  height: min(88vh, 900px);
  border: 1px solid #dbe2ee;
  border-radius: 4px;
  background: #fcfcfc;
  color: #0f172a;
  display: grid;
  grid-template-rows: auto minmax(340px, 1fr) auto;
  overflow: hidden;
}

.yaml-import-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #fcfcfc;
}

.yaml-import-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.yaml-import-header p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.yaml-import-body {
  min-height: 0;
  min-width: 0;
  padding: 0 10px;
  background: #fcfcfc;
}

.yaml-import-preview-wrap {
  height: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 4px;
  background: #101729;
  border: 1px solid #1e293b;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.yaml-import-preview-status {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.24);
  background: #172033;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-preview-status--ready {
  color: #bbf7d0;
}

.yaml-import-preview-status--error {
  color: #fecaca;
}

.yaml-import-preview-status--working {
  color: #bfdbfe;
}

.yaml-import-preview {
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 10px 0;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.35;
  font-variant-ligatures: none;
  tab-size: 8;
  white-space: pre;
  scrollbar-width: auto;
  scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
  scrollbar-gutter: stable both-edges;
}

.yaml-import-preview-line {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  min-height: 18px;
  border-left: 3px solid transparent;
}

.yaml-import-preview-line--mapped {
  background: rgba(22, 101, 52, 0.22);
  border-left-color: #22c55e;
}

.yaml-import-preview-line--dropped,
.yaml-import-preview-line--unmapped {
  background: rgba(153, 27, 27, 0.34);
  border-left-color: #ef4444;
}

.yaml-import-preview-line--error {
  background: rgba(153, 27, 27, 0.36);
  border-left-color: #ef4444;
}

.yaml-import-preview-line-number {
  padding: 0 10px;
  color: #64748b;
  text-align: right;
  user-select: none;
}

.yaml-import-preview-line-text {
  min-width: 0;
  white-space: pre;
}

.yaml-import-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.yaml-import-preview::-webkit-scrollbar-track {
  background: transparent;
}

.yaml-import-preview::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.yaml-import-report {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: auto;
  padding: 14px;
  border: 1px solid #dbe2ee;
  border-radius: 4px;
  background: #ffffff;
}

.yaml-import-report h4,
.yaml-import-report h5 {
  margin: 0;
  color: #1f3f6d;
}

.yaml-import-report h4 {
  font-size: 18px;
}

.yaml-import-report h5 {
  font-size: 13px;
}

.yaml-import-report p {
  margin: 8px 0 0;
}

.yaml-import-report--error {
  border-color: #fecaca;
  background: #fff7f7;
}

.yaml-import-report--error h4 {
  color: #b91c1c;
}

.yaml-import-report__meta {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.yaml-import-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.yaml-import-summary div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #f8fafc;
}

.yaml-import-summary strong {
  font-size: 22px;
  color: #1f3f6d;
}

.yaml-import-summary span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-project-report {
  margin-top: 14px;
  padding: 10px;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  background: #eff6ff;
}

.yaml-import-project-report p {
  margin: 6px 0 0;
  color: #1e3a8a;
  font-size: 13px;
}

.yaml-import-project-report__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
  color: #1e40af;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-project-report__dropped {
  color: #991b1b;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-import-error {
  margin: 12px 0 0;
  padding: 10px;
  border: 1px solid #fecaca;
  border-radius: 4px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 700;
}

.yaml-import-warnings {
  margin-top: 14px;
  padding: 10px;
  border: 1px solid #fde68a;
  border-radius: 4px;
  background: #fffbeb;
}

.yaml-import-warnings ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.yaml-import-section-list {
  display: grid;
  gap: 6px;
  margin-top: 14px;
}

.yaml-import-section-row {
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) 150px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #f8fafc;
}

.yaml-import-section-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-section-kind {
  justify-self: start;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #dbeafe;
  color: #1e3a8a;
}

.yaml-import-section-kind--component {
  background: #dcfce7;
  color: #166534;
}

.yaml-import-section-kind--unsupported {
  background: #fee2e2;
  color: #991b1b;
}

.yaml-import-section-message {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.yaml-import-empty {
  color: #64748b;
  font-size: 13px;
}

.yaml-import-components {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.yaml-import-component-list {
  display: grid;
  gap: 6px;
}

.yaml-import-component-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.5fr) 110px minmax(150px, 0.65fr) 120px minmax(170px, 0.8fr) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #ffffff;
}

.yaml-import-component-path,
.yaml-import-component-target,
.yaml-import-component-schema {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  font-weight: 700;
}

.yaml-import-component-schema {
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.yaml-import-component-status {
  justify-self: start;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #dbeafe;
  color: #1e3a8a;
}

.yaml-import-component-status--matched {
  background: #dcfce7;
  color: #166534;
}

.yaml-import-component-status--mapped {
  background: #dcfce7;
  color: #166534;
}

.yaml-import-component-status--partial {
  background: #fef3c7;
  color: #92400e;
}

.yaml-import-component-status--unmatched,
.yaml-import-component-status--invalid,
.yaml-import-component-status--schema_missing,
.yaml-import-component-status--schema_error,
.yaml-import-component-status--schema_not_loaded {
  background: #fee2e2;
  color: #991b1b;
}

.yaml-import-component-message {
  display: grid;
  gap: 3px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.yaml-import-component-message small {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

@media (max-width: 960px) {
  .yaml-import-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .yaml-import-section-row,
  .yaml-import-component-row {
    grid-template-columns: 1fr;
  }
}

.yaml-import-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  background: #fcfcfc;
}
</style>
