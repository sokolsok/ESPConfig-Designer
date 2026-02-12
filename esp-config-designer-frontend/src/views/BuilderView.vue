<template>
  <div class="builder-layout">
  <ConfirmModal
    :open="confirmOpen"
    title="Confirm"
    message="Are you sure?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="confirmRemove"
    @cancel="cancelRemove"
  />
  <ConfirmModal
    :open="confirmNewOpen"
    title="Confirm"
    message="Start a new project without saving?"
    confirm-text="Yes"
    cancel-text="Cancel"
    @confirm="handleNewProject"
    @cancel="confirmNewOpen = false"
  />
    <GpioGuideModal
      :open="gpioGuideOpen"
      :guide="gpioGuide"
      :fallback-title="gpioGuideFallbackTitle"
      @close="gpioGuideOpen = false"
    />
    <div v-if="exportErrorOpen && formErrors.length" class="notice notice--error notice--block">
      <strong>There are errors in the form. Fix them before exporting.</strong>
      <ul>
        <li v-for="(error, index) in formErrors" :key="`${error.path}-${index}`">
          {{ error.path }} = "{{ error.message }}"
        </li>
      </ul>
    </div>
    <div v-if="projectSaveError" class="notice notice--error notice--block">
      <strong>Project save failed.</strong>
      <div>{{ projectSaveError }}</div>
    </div>
    <div v-else-if="projectSaveMessage" class="notice notice--warning notice--block">
      {{ projectSaveMessage }}
    </div>
    <div v-if="installModalOpen" class="install-modal-overlay" @click.self="installModalOpen = false">
      <div class="install-modal" role="dialog" aria-modal="true" aria-label="Install options">
        <div class="install-modal-header">
          <h3>Install</h3>
          <button type="button" class="btn-standard compact" @click="installModalOpen = false">Close</button>
        </div>
        <div class="install-modal-body">
          <button type="button" class="btn-standard install-option" @click="handleInstallSerialPort">
            Via Serial Port
          </button>
          <button type="button" class="btn-standard install-option" @click="handleInstallOta">
            Wireless (OTA)
          </button>
          <button type="button" class="btn-standard install-option" @click="handleInstallDownload">
            Download Binary
          </button>
        </div>
      </div>
    </div>
    <div v-if="compileModalOpen" class="compile-modal-overlay">
      <div class="compile-modal" role="dialog" aria-modal="true" :aria-label="terminalTitle">
        <div class="compile-modal-header">
          <div class="compile-meta">
            <span class="compile-title">{{ terminalTitle }}</span>
            <span :class="compileStateClass">{{ compileStateLabel }}</span>
          </div>
          <div class="compile-actions">
            <span v-if="compileIsReconnecting" class="compile-reconnect">Reconnecting...</span>
            <button
              type="button"
              class="btn-standard compact"
              @click="toggleCompileAutoscroll"
            >
              {{ compileAutoScroll ? "Pause autoscroll" : "Resume autoscroll" }}
            </button>
          </div>
        </div>

        <div class="compile-modal-body" ref="compileConsoleRef">
          <div>
            <div
              v-for="line in compileLogLines"
              :key="line.id"
              :class="line.className"
              v-html="line.html"
            ></div>
          </div>
        </div>

        <div class="compile-modal-footer">
          <div v-if="compileJobError" class="compile-error">{{ compileJobError }}</div>
          <div class="compile-footer-actions">
            <button
              v-if="canDownloadCompiledBinary"
              type="button"
              class="btn-standard"
              @click="downloadBinary"
            >
              Download
            </button>
            <button
              type="button"
              class="btn-standard"
              :disabled="!canCancelCompile"
              @click="cancelCompile"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-standard secondary"
              :disabled="!canCloseCompile"
              @click="closeCompileModal"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="builder-shell">
      <aside class="builder-sidebar">
        <div class="sidebar-top">
          <div class="sidebar-project-bar" ref="projectMenuRef">
            <button
              type="button"
              class="secondary btn-standard project-menu-button"
              @click="toggleProjectMenu"
            >
              Project
            </button>
            <span class="project-filename">{{ projectFilename }}</span>
            <div v-if="projectMenuOpen" class="project-menu">
              <button type="button" class="btn-standard" @click="requestNewProject">
                New
              </button>
              <button type="button" class="btn-standard" @click="projectMenuOpen = false">
                Open
              </button>
              <button type="button" class="btn-standard" :disabled="isProjectSaving" @click="handleProjectSave">
                {{ isProjectSaving ? "Saving..." : "Save" }}
              </button>
              <button type="button" class="btn-standard" @click="projectMenuOpen = false">
                Save as
              </button>
              <button type="button" class="btn-standard" @click="projectMenuOpen = false">
                Settings
              </button>
            </div>
          </div>
        </div>
        <div class="sidebar-middle">
          <div class="sidebar-panel sidebar-panel--components">
            <div class="sidebar-panel__header">
              <h4>Components</h4>
            </div>
            <div class="sidebar-panel__body">
              <div class="sidebar-components">
                <div class="components-toolbar">
                  <button
                    v-for="tab in tabs"
                    :key="`tab-${tab}`"
                    class="component-chip"
                    :class="{ active: activeTab === tab, 'component-chip--pulse': tab === 'Busses' && busTabPulse }"
                    @click="activeTab = tab"
                  >
                    <span>{{ tab }}</span>
                  </button>
                  <div class="component-separator-line"></div>
                  <div class="component-separator">
                    <div class="component-separator__row">
                      <span>User components</span>
                      <button
                        class="secondary compact btn-add sidebar-components-add"
                        type="button"
                        aria-label="Add component"
                        @click="addComponentSlot"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <button
                    v-for="(componentEntry, index) in config.components"
                    :key="`${componentIdFromEntry(componentEntry) || 'component'}-${index}`"
                    class="component-chip"
                    type="button"
                    :class="{ active: activeComponentSlot === index && activeTab === 'Components' }"
                    @click="openComponentViewer(index)"
                  >
                    <span>{{ componentLabel(componentIdFromEntry(componentEntry)) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="builder-content">
        <section class="builder-grid">
        <div class="builder-panel">
          <div class="config-title">
            <select
              id="viewSelect"
              class="config-title-select"
              v-model="previewMode"
              @change="handleSelectBlur"
            >
              <option value="single">Single YAML Preview</option>
              <option value="tabs">Tabbed YAML Preview</option>
            </select>
          </div>
          <div class="preview-shell" :class="{ split: splitPreviewEnabled }">
            <div v-if="splitPreviewEnabled" class="preview-tabs">
              <button
                class="preview-scroll"
                type="button"
                aria-label="Scroll tabs left"
                :disabled="!canScrollLeft"
                @click="scrollPreviewTabs(-1)"
              >
                <span class="preview-scroll-icon">‹</span>
              </button>
              <div class="preview-tab-list" ref="previewTabList">
                <button
                  v-for="tab in visiblePreviewTabs"
                  :key="tab.key"
                  class="preview-tab-button"
                  :class="{ active: activePreviewTab === tab.key }"
                  type="button"
                  @click="activePreviewTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>
              <button
                class="preview-scroll"
                type="button"
                aria-label="Scroll tabs right"
                :disabled="!canScrollRight"
                @click="scrollPreviewTabs(1)"
              >
                <span class="preview-scroll-icon">›</span>
              </button>
            </div>
            <div v-if="splitPreviewEnabled" class="preview-tab-measure">
              <button
                v-for="tab in previewTabs"
                :key="tab.key"
                ref="previewTabMeasureButtons"
                class="preview-tab-button"
                type="button"
              >
                {{ tab.label }}
              </button>
            </div>
            <div class="yaml-scroll">
              <div class="preview-card">
                <button
                  type="button"
                  class="preview-copy"
                  :class="{ 'preview-copy--shift': hasPreviewScrollbar }"
                  @click="handleCopyPreview"
                >
                  <img
                    src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/content-copy.svg"
                    alt="Copy code"
                  />
                  <span>{{ copyLabel }}</span>
                </button>
                <div
                  v-if="showDisplayAutomationNotice"
                  class="preview-callout hljs"
                >
                  <span class="hljs-comment">
                    # Interval section live in the Automation tab -
                    <a
                      href="#"
                      class="preview-callout-link"
                      @click.prevent="switchPreviewTab('automation')"
                    >
                      LINK
                    </a>
                  </span>
                </div>
                <div class="yaml-scroll-inner" ref="previewScrollInner">
                  <pre><code class="hljs" v-html="highlightedYaml"></code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="builder-panel">
          <div class="config-title">
            <select
              id="modeSelect"
              class="config-title-select"
              v-model="activeModeLevel"
              @change="handleSelectBlur"
            >
              <option value="Simple">Simple configuration</option>
              <option value="Normal">Normal configuration</option>
              <option value="Advanced">Advanced configuration</option>
            </select>
          </div>
          <div class="config-scroll">
        <div class="module-card" v-if="activeTab === 'Core'">
          <div class="components-header">
            <div class="components-title">
              <h2>Core</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <SchemaRenderer
              :component-id="esphomeCoreId"
              :component-config="esphomeCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="esphomeCoreId"
              :global-store="globalStore"
              @update="handleCoreSchemaUpdate"
            />
            <SchemaRenderer
              :component-id="substitutionsCoreId"
              :component-config="substitutionsCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="substitutionsCoreId"
              :global-store="globalStore"
              @update="handleSubstitutionsSchemaUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Platform'">
          <div class="components-header">
            <div class="components-title">
              <h2>Platform</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <SchemaRenderer
              :component-id="platformCoreId"
              :component-config="platformCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="platformCoreId"
              :global-store="globalStore"
              @update="handlePlatformSchemaUpdate"
            />
            <SchemaRenderer
              v-if="platformDetailId"
              :component-id="platformDetailId"
              :component-config="platformCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="platformDetailId"
              :global-store="globalStore"
              @update="handlePlatformSchemaUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Network'">
          <div class="components-header">
            <div class="components-title">
              <h2>Network</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <SchemaRenderer
              :component-id="networkCoreId"
              :component-config="networkCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="networkCoreId"
              :field-filter="['transport']"
              :global-store="globalStore"
              @update="handleNetworkSchemaUpdate"
            />
            <SchemaRenderer
              v-if="networkDetailId"
              :component-id="networkDetailId"
              :component-config="networkCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="networkDetailId"
              :global-store="globalStore"
              @update="handleNetworkSchemaUpdate"
            />
            <SchemaRenderer
              :component-id="networkCoreId"
              :component-config="networkCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="networkCoreId"
              :field-filter="['ota']"
              :global-store="globalStore"
              @update="handleNetworkSchemaUpdate"
            />
            <SchemaRenderer
              :component-id="networkCoreId"
              :component-config="networkCoreConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="networkCoreId"
              :field-filter="['web_server']"
              :global-store="globalStore"
              @update="handleNetworkSchemaUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Protocols'">
          <div class="components-header">
            <div class="components-title">
              <h2>Protocols</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <div class="module-tabs">
              <button
                v-for="tab in protocolTabs"
                :key="tab.key"
                class="btn-standard"
                :class="{ active: activeProtocolKey === tab.key }"
                @click="activeProtocolKey = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
            <SchemaRenderer
              v-if="protocolDetailId"
              :component-id="protocolDetailId"
              :component-config="protocolDetailConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="protocolDetailId"
              :global-store="globalStore"
              @update="handleProtocolDetailUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Busses'">
          <div class="components-header">
            <div class="components-title">
              <h2>Busses</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <div class="notice notice--warning">
              Required interfaces are enabled automatically when you add a component that needs them, so
              you do not have to enable them right away. You still need to configure them manually.
            </div>
            <div class="module-tabs">
              <button
                v-for="tab in bussesTabs"
                :key="tab.key"
                class="btn-standard"
                :class="{ active: activeBussesKey === tab.key }"
                @click="activeBussesKey = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
            <SchemaRenderer
              v-if="bussesDetailId"
              :component-id="bussesDetailId"
              :component-config="bussesDetailConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="bussesDetailId"
              :global-store="globalStore"
              @update="handleBussesDetailUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'System'">
          <div class="components-header">
            <div class="components-title">
              <h2>System</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <div class="module-tabs">
              <button
                v-for="tab in otherTabs"
                :key="tab.key"
                class="btn-standard"
                :class="{ active: activeOtherKey === tab.key }"
                @click="activeOtherKey = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
            <SchemaRenderer
              v-if="otherDetailId"
              :component-id="otherDetailId"
              :component-config="otherDetailConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="otherDetailId"
              :global-store="globalStore"
              @update="handleOtherDetailUpdate"
            />
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Automation'">
          <div class="components-header">
            <div class="components-title">
              <h2>Automation</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
          </div>
          <div class="module-card__body">
            <div class="module-tabs">
              <button
                v-for="tab in automationTabs"
                :key="tab.key"
                type="button"
                class="btn-standard"
                :class="{ active: activeAutomationKey === tab.key }"
                @click="activeAutomationKey = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
            <SchemaRenderer
              v-if="automationDetailId"
              :component-id="automationDetailId"
              :component-config="automationDetailConfig"
              :root-value="config"
              :mode-level="activeModeLevel"
              :id-registry="idRegistry"
              :name-registry="nameRegistry"
              :id-index="idIndex"
              :gpio-options="gpioOptions"
              :gpio-usage="gpioUsageIndex"
              :gpio-title="gpioTitle"
              :context-component-id="automationDetailId"
              :global-store="globalStore"
              @update="handleAutomationDetailUpdate"
            />
            <div
              v-if="
                (activeModeLevel === 'Normal' || activeModeLevel === 'Advanced') &&
                generatedAutomation[activeAutomationKey]?.length
              "
              class="schema-group"
            >
              <div
                v-for="(entry, index) in generatedAutomation[activeAutomationKey]"
                :key="`generated-${activeAutomationKey}-${index}`"
                class="schema-list list-normal read-only-box"
              >
                <div class="schema-list-header">Auto-generated (read-only)</div>
                <div class="schema-list-item">
                  <div
                    v-for="(line, lineIndex) in generatedEntryLines(entry)"
                    :key="`generated-line-${index}-${lineIndex}`"
                    class="note"
                  >
                    {{ line }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="module-card" v-if="activeTab === 'Components'">
          <div class="components-header">
            <div class="components-title">
              <h2>{{ componentsHeader }}</h2>
              <a
                v-if="activeTabHelpUrl"
                class="filter-help"
                :href="activeTabHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
              >
                ?
              </a>
            </div>
            <div v-if="!isComponentPickerOpen" class="components-actions">
              <button
                v-if="activeComponentSlot !== null"
                type="button"
                class="secondary compact btn-standard"
                @click="requestRemoveComponent(activeComponentSlot)"
              >
                Remove
              </button>
            </div>
          </div>
          <div :class="['module-card__body', { 'module-card__body--picker': isComponentPickerOpen }]">
            <div v-if="isComponentPickerOpen" class="components-picker-shell">
              <div class="components-picker">
                <input
                    id="componentsSearch"
                    v-model="componentsQuery"
                    placeholder="Search components"
                  />
                  <div v-if="componentCatalogError" class="notice notice--error components-error">
                    components_list.json not found
                  </div>
                  <div class="components-list">
                    <details
                      v-for="(category, categoryIndex) in filteredCategories"
                      :key="`${category.slug}-${categoryIndex}`"
                      class="components-category"
                      :open="Boolean(componentsQuery)"
                    >
                      <summary>{{ category.title }}</summary>
                      <div class="components-items" v-if="category.items.length">
                        <button
                          v-for="(item, itemIndex) in category.items"
                          :key="`${item.id}-${category.slug}-${itemIndex}`"
                          type="button"
                          class="component-item"
                          :class="{ selected: selectedComponentIds.has(item.id) }"
                          @click="selectComponent(item)"
                        >
                          <span>{{ item.name }}</span>
                          <span class="component-id">{{ item.id }}</span>
                        </button>
                      </div>
                      <div
                        v-for="(subcategory, subIndex) in category.subcategories"
                        :key="`${subcategory.slug}-${subIndex}`"
                        class="components-subcategory"
                      >
                        <h3>{{ subcategory.title }}</h3>
                        <div class="components-items">
                          <button
                            v-for="(item, itemIndex) in subcategory.items"
                            :key="`${item.id}-${subcategory.slug}-${itemIndex}`"
                            class="component-item"
                            type="button"
                            :class="{ selected: selectedComponentIds.has(item.id) }"
                            @click="selectComponent(item)"
                          >
                            <span>{{ item.name }}</span>
                            <span class="component-id">{{ item.id }}</span>
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
            </div>
            <div v-else class="component-form">
              <div v-if="activeComponentBusLabels" class="notice notice--warning component-bus-note">
                Make sure {{ activeComponentBusLabels }} is configured correctly.
                <a href="#" class="preview-callout-link" @click.prevent="focusRequiredBus">
                  LINK
                </a>
              </div>
              <SchemaRenderer
                :component-id="activeComponentId"
                :component-config="activeComponentConfig"
                :custom-config="activeComponentCustomConfig"
                :mode-level="activeModeLevel"
                :id-registry="idRegistry"
                :name-registry="nameRegistry"
                :id-index="idIndex"
                :gpio-options="gpioOptions"
                :gpio-usage="gpioUsageIndex"
                :gpio-title="gpioTitle"
                :context-component-id="activeComponentId"
                :global-store="globalStore"
                @update="handleSchemaUpdate"
                @update-custom="handleCustomConfigUpdate"
              />
            </div>
          </div>
        </div>
          </div>


      </div>

      </section>
    </div>
  </div>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  provide,
  ref,
  watch
} from "vue";
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import { ESPLoader, Transport } from "esptool-js";
import ConfirmModal from "../components/ConfirmModal.vue";
import GpioGuideModal from "../components/GpioGuideModal.vue";
import SchemaRenderer from "../components/SchemaRenderer.vue";
import { loadGpioData, resolveGpioKey } from "../utils/gpioData";
import { loadComponentSchema, loadSchemaByPath } from "../utils/schemaLoader";
import {
  buildComponentsYaml,
  buildDisplayAnimationIntervals,
  buildSchemaYaml
} from "../utils/schemaYaml";
import { buildGlobalRegistry, isFieldVisible as isSchemaFieldVisible } from "../utils/schemaVisibility";
import { getRequiredInterfaces } from "../utils/schemaRequirements";
import { generateFieldValue, resolveFieldValue, resolveGenerationSpec } from "../utils/schemaAuto";

hljs.registerLanguage("yaml", yaml);

const tabs = ["Core", "Platform", "Network", "Protocols", "Busses", "System", "Automation"];
const activeTab = ref(tabs[0]);
const splitPreviewEnabled = ref(false);
const activePreviewTab = ref("core");
const previewTabList = ref(null);
const previewTabMeasureButtons = ref([]);
const previewTabStart = ref(0);
const previewTabWidths = ref([]);
const previewTabAvailableWidth = ref(0);
const lastPreviewTabKeys = ref([]);
const previewScrollInner = ref(null);
const hasPreviewScrollbar = ref(false);
const componentsQuery = ref("");
const busTabPulse = ref(false);
let busTabPulseTimer = null;
const pendingBusPulseIds = new Set();
const copySuccess = ref(false);
let copyResetTimer = null;
const activeComponentSlot = ref(null);
const isComponentPickerOpen = ref(false);
const confirmOpen = ref(false);
const pendingRemoveIndex = ref(null);
const confirmNewOpen = ref(false);
const componentSchemas = ref({});
const componentCatalog = ref({ categories: [] });
const isComponentCatalogLoading = ref(true);
const componentCatalogError = ref(null);
const modeLevels = ["Simple", "Normal", "Advanced"];
const projectMenuOpen = ref(false);
const projectMenuRef = ref(null);
const isProjectSaving = ref(false);
const projectSaveMessage = ref("");
const projectSaveError = ref("");
const lastSavedYamlName = ref("");
const lastSavedYamlBody = ref("");
const compileModalOpen = ref(false);
const compileConsoleRef = ref(null);
const compileAutoScroll = ref(true);
const compileJobId = ref("");
const compileJobState = ref("");
const compileJobError = ref("");
const compileLogLines = ref([]);
const compileLogSeq = ref(0);
const compileActiveAction = ref("");
const compileIsReconnecting = ref(false);
const installModalOpen = ref(false);
const compileTailCheckpoint = ref(0);
const compileSseLogSeen = ref(false);
const compileReconnectAttempts = ref(0);
const installPlanMode = ref("");
const installPlanOtaHost = ref("");
const installPlanSerialPort = ref(null);
const installPlanDownloadReady = ref(false);
const localFlashRunning = ref(false);
const projectDeviceStatus = ref("unknown");
const projectDeviceHost = ref("");
const projectDeviceName = ref("");
let compileStreamSource = null;
let compileStatusPollId = null;
let compileLongPollActive = false;
let compileTailStartTimer = null;
let compileLogFlushHandle = null;
let compileLogScrollHandle = null;
let projectDevicePollId = null;
let projectsUpdatedChannel = null;
const compileLogQueue = [];

const activeModeLevel = ref(modeLevels[0]);
const resolveModeLevel = (value) => {
  if (typeof value !== "string") return modeLevels[0];
  const trimmed = value.trim();
  if (modeLevels.includes(trimmed)) return trimmed;
  const stripped = trimmed.replace(/\s*mode$/i, "");
  return modeLevels.includes(stripped) ? stripped : modeLevels[0];
};
const exportErrorOpen = ref(false);
const gpioGuideOpen = ref(false);
const gpioData = ref({ sections: {} });
const esphomeCoreSchema = ref(null);
const substitutionsCoreSchema = ref(null);
const platformCoreSchema = ref(null);
const platformDetailSchema = ref(null);
const networkDetailSchema = ref(null);
const networkCoreSchema = ref(null);
const protocolsSchemas = ref({});
const bussesSchemas = ref({});
const otherSchemas = ref({});
const automationSchemas = ref({});

// Build a registry of values (used for duplicate id/name detection).
const buildValueRegistry = (components, schemas, match) => {
  const counts = {};

  const addValue = (value) => {
    if (!value) return;
    const key = value.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  };

  const walkFields = (configValue, fields) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      if (match(field, value)) {
        addValue(value);
      }
      if (field.type === "object") {
        walkFields(value || {}, field.fields || []);
      }
      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item) => walkFields(item || {}, field.item.fields));
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields);
  });

  return counts;
};

const buildIdOptions = (idIndex, domain, contextComponentId) => {
  const seen = new Set();
  const options = [];

  (idIndex || []).forEach((entry) => {
    if (contextComponentId && entry.componentId === contextComponentId) return;
    if (domain && entry.domain !== domain) return;
    if (seen.has(entry.idLower)) return;
    seen.add(entry.idLower);
    options.push(entry.id);
  });

  return options;
};

// Validate id_ref fields against the current id registry.
const buildIdRefErrors = (components, schemas, idIndex) => {
  const errors = [];

  const pushError = (componentId, path, message) => {
    const label = componentId ? componentId.split(/[./]/).pop() : "component";
    const pathLabel = path.length ? `${label}.${path.join(".")}` : label;
    errors.push({ path: pathLabel, message });
  };

  const checkIdRef = (value, field, componentId, path) => {
    const options = buildIdOptions(idIndex, field.domain, componentId);
    if (!options.length) {
      pushError(componentId, path, "No matching identifiers available");
      return;
    }
    if (!value || typeof value !== "string") {
      return;
    }
    const match = options.some((option) => option.toLowerCase() === value.toLowerCase());
    if (!match) {
      pushError(componentId, path, "No matching identifiers available");
    }
  };

  const walkFields = (configValue, fields, componentId, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      const nextPath = [...path, field.key];

      if (field.type === "id_ref") {
        checkIdRef(value, field, componentId, nextPath);
      }

      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], componentId, nextPath);
      }

      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, componentId, [...nextPath, String(index)]);
        });
      }

      if (field.item?.extends === "base_actions.json" && Array.isArray(value)) {
        value.forEach((action, index) => {
          const actionFields = Array.isArray(action?.fields) ? action.fields : [];
          const actionConfig = action?.config || {};
          actionFields.forEach((actionField) => {
            if (actionField.type !== "id_ref") return;
            const actionPath = [...nextPath, String(index), actionField.key];
            const actionValue = actionConfig[actionField.key];
            checkIdRef(actionValue, actionField, componentId, actionPath);
          });
        });
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields, componentId, []);
  });

  return errors;
};

const buildDisplayElementIdErrors = (
  components,
  schemas,
  idIndex,
  imageFiles,
  animationFiles,
  iconNames
) => {
  const errors = [];

  const pushError = (componentId, path, message) => {
    const label = componentId ? componentId.split(/[./]/).pop() : "component";
    const pathLabel = path.length ? `${label}.${path.join(".")}` : label;
    errors.push({ path: pathLabel, message });
  };

  const hasOptionMatch = (value, options) =>
    options.some((option) => option.toLowerCase() === String(value || "").toLowerCase());

  const checkIdSelection = (value, options, componentId, path, message) => {
    if (!options.length) {
      pushError(componentId, path, "No matching identifiers available");
      return;
    }
    if (!value || !String(value).trim()) {
      pushError(componentId, path, message || "Please select an ID");
      return;
    }
    if (!hasOptionMatch(value, options)) {
      pushError(componentId, path, "No matching identifiers available");
    }
  };

  const checkFileSelection = (value, options, componentId, path, emptyMessage, missingMessage) => {
    if (!options.length) {
      pushError(componentId, path, emptyMessage);
      return;
    }
    if (!value || !String(value).trim()) {
      pushError(componentId, path, missingMessage);
      return;
    }
    if (!options.includes(value)) {
      pushError(componentId, path, emptyMessage);
    }
  };

  const checkIconSelection = (value, icons, componentId, path) => {
    if (!icons.length) {
      pushError(componentId, path, "No MDI icons available");
      return;
    }
    const name = String(value || "").trim();
    const trimmed = name.startsWith("mdi:") ? name.slice(4) : name;
    if (!trimmed) {
      pushError(componentId, path, "Please select an icon");
      return;
    }
    if (!icons.some((icon) => icon.toLowerCase() === trimmed.toLowerCase())) {
      pushError(componentId, path, "Invalid MDI icon name");
    }
  };

  components.forEach((entry, entryIndex) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas?.[componentId];
    if (schema?.domain !== "display") return;
    const layout = entry?.config?._display_builder;
    const elements = Array.isArray(layout?.elements) ? layout.elements : [];
    if (!elements.length) return;

    elements.forEach((element, index) => {
      const basePath = ["_display_builder", "elements", String(index)];
      if (element?.type === "text" && element?.textMode === "dynamic") {
        const options = buildIdOptions(idIndex, element?.dynamicDomain || "", componentId);
        checkIdSelection(element?.dynamicId, options, componentId, [...basePath, "dynamicId"], "Please select a source ID");
      }

      if (element?.type === "graph") {
        if (!String(element?.graphId || "").trim()) {
          pushError(componentId, [...basePath, "graphId"], "Please provide a graph ID");
        }
        if (element?.useTraces) {
          const traces = Array.isArray(element?.traces) ? element.traces : [];
          traces.forEach((trace, traceIndex) => {
            const options = buildIdOptions(idIndex, "sensor", componentId);
            checkIdSelection(trace?.sensor, options, componentId, [...basePath, "traces", String(traceIndex), "sensor"], "Please select a sensor ID");
          });
        } else {
          const options = buildIdOptions(idIndex, "sensor", componentId);
          checkIdSelection(element?.sensor, options, componentId, [...basePath, "sensor"], "Please select a sensor ID");
        }
      }

      if (element?.type === "animation") {
        if (!String(element?.animationId || "").trim()) {
          pushError(componentId, [...basePath, "animationId"], "Please provide an animation ID");
        }
        checkFileSelection(
          element?.animationFile,
          animationFiles || [],
          componentId,
          [...basePath, "animationFile"],
          "No GIF animations available",
          "Please select an animation file"
        );
      }

      if (element?.type === "image") {
        checkFileSelection(
          element?.image,
          imageFiles || [],
          componentId,
          [...basePath, "image"],
          "No image files available",
          "Please select an image file"
        );
      }

      if (element?.type === "icon") {
        checkIconSelection(element?.icon, iconNames || [], componentId, [...basePath, "icon"]);
      }
    });
  });

  return errors;
};

const resolveDependentValue = (key, contextValue, contextFields) => {
  if (contextValue && contextValue[key] !== undefined) {
    return contextValue[key];
  }
  const fieldDefinition = contextFields?.find((field) => field.key === key);
  if (fieldDefinition && fieldDefinition.default !== undefined) {
    return fieldDefinition.default;
  }
  return undefined;
};

const isFieldVisible = (field, contextValue, contextFields) => {
  const dependency = field?.dependsOn;
  if (!dependency) return true;
  const actual = resolveDependentValue(dependency.key, contextValue, contextFields);
  if (dependency.value !== undefined) return actual === dependency.value;
  if (Array.isArray(dependency.values)) return dependency.values.includes(actual);
  if (dependency.notValue !== undefined) return actual !== dependency.notValue;
  return Boolean(actual);
};

// Additional validation rules (e.g. base64 for API encryption).
const buildValidationErrors = (entries) => {
  const errors = [];

  const pushError = (label, path, message) => {
    const pathLabel = path.length ? `${label}.${path.join(".")}` : label;
    errors.push({ path: pathLabel, message });
  };

  const validateField = (value, field, label, path) => {
    if (field?.type === "password" && field?.settings?.format === "base64_44") {
      const content = typeof value === "string" ? value.trim() : "";
      if (!/^[A-Za-z0-9+/]{43}=$/.test(content)) {
        pushError(label, path, "Key must be base64 (44 chars, ending with =)." );
      }
    }
  };

  const walkFields = (configValue, fields, label, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      if (!field?.key) return;
      const value = configValue?.[field.key];
      const nextPath = [...path, field.key];
      if (!isFieldVisible(field, configValue, fields)) return;
      validateField(value, field, label, nextPath);
      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], label, nextPath);
      }
      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, label, [...nextPath, String(index)]);
        });
      }
    });
  };

  entries.forEach((entry) => {
    if (!entry?.schema?.fields) return;
    walkFields(entry.config || {}, entry.schema.fields, entry.label, []);
  });

  return errors;
};

// Build GPIO usage index from components and extra configs (busses/network).
const buildGpioUsageIndex = (components, schemas, extraConfigs = []) => {
  const usage = {};

  const normalizeKey = (value) =>
    value.toLowerCase().replace(/\s+/g, "").replace(/^gpio/, "");

  const addUsage = (value) => {
    if (!value || typeof value !== "string") return;
    const key = normalizeKey(value);
    usage[key] = (usage[key] || 0) + 1;
  };

  const walkFields = (configValue, fields) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      if (field.type === "gpio") {
        addUsage(value);
      }
      if (field.type === "object") {
        walkFields(value || {}, field.fields || []);
      }
      if (field.type === "list" && Array.isArray(value)) {
        if (field.item?.type === "gpio") {
          value.forEach((item) => addUsage(item));
        } else if (field.item?.type === "object" && field.item?.fields) {
          value.forEach((item) => walkFields(item || {}, field.item.fields));
        }
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields);
  });

  extraConfigs.forEach((entry) => {
    if (!entry?.fields) return;
    walkFields(entry.config || {}, entry.fields);
  });

  return usage;
};

// Flatten all ids with component context for id_ref lookups.
const buildIdIndex = (components, schemas) => {
  const entries = [];

  const addEntry = (value, schema, componentId) => {
    if (!value) return;
    entries.push({
      id: value,
      idLower: value.toLowerCase(),
      domain: schema?.domain || componentId.split(/[./]/)[0] || "",
      componentId
    });
  };

  const walkFields = (configValue, fields, schema, componentId) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      if (field.type === "id" && typeof value === "string" && value.trim()) {
        addEntry(value, schema, componentId);
      }
      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], schema, componentId);
      }
      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item) => walkFields(item || {}, field.item.fields, schema, componentId));
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields, schema, componentId);
  });

  return entries;
};

const buildDuplicateErrors = (components, schemas, idCounts, nameCounts) => {
  const errors = [];

  const pushError = (componentId, path, message) => {
    const label = componentId ? componentId.split(/[./]/).pop() : "component";
    const pathLabel = path.length ? `${label}.${path.join(".")}` : label;
    errors.push({ path: pathLabel, message });
  };

  const walkFields = (configValue, fields, componentId, path = []) => {
    if (!fields?.length) return;
    fields.forEach((field) => {
      const value = configValue?.[field.key];
      const nextPath = [...path, field.key];

      if (field.type === "id" && typeof value === "string" && value.trim()) {
        const key = value.toLowerCase();
        if ((idCounts[key] || 0) > 1) {
          pushError(componentId, nextPath, "ID already used");
        }
      }

      if (field.key === "name" && typeof value === "string" && value.trim()) {
        const key = value.toLowerCase();
        if ((nameCounts[key] || 0) > 1) {
          pushError(componentId, nextPath, "Name already used");
        }
      }

      if (field.type === "object") {
        walkFields(value || {}, field.fields || [], componentId, nextPath);
      }

      if (
        field.type === "list" &&
        Array.isArray(value) &&
        field.item?.type === "object" &&
        field.item?.fields
      ) {
        value.forEach((item, index) => {
          walkFields(item || {}, field.item.fields, componentId, [...nextPath, String(index)]);
        });
      }
    });
  };

  components.forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = schemas[componentId];
    if (!schema?.fields) return;
    walkFields(entry?.config || {}, schema.fields, componentId, []);
  });

  return errors;
};

const matchesQuery = (item, query) => {
  if (!query) return true;
  const value = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(value) || item.id.toLowerCase().includes(value)
  );
};

const componentIndex = computed(() => {
  const map = new Map();
  componentCatalog.value?.categories?.forEach((category) => {
    category.items.forEach((item) => map.set(item.id, item.name));
    category.subcategories.forEach((subcategory) => {
      subcategory.items.forEach((item) => map.set(item.id, item.name));
    });
  });
  return map;
});

const componentLabel = (id) => (id ? componentIndex.value.get(id) ?? id : "");

const projectFilename = computed(() => {
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  const resolvedName = resolveFieldValue("name", coreValue, coreFields, config.value);
  const name = String(resolvedName || "").trim();
  if (!name) return "new_file.yaml";
  return name.toLowerCase().endsWith(".yaml") ? name : `${name}.yaml`;
});


const componentIdFromEntry = (entry) =>
  typeof entry === "string" ? entry : entry?.id || "";

const parseComponentId = (componentId) => {
  if (!componentId) return { domain: "", platform: "" };
  const separator = componentId.includes(".") ? "." : "/";
  const [domain, platform] = componentId.split(separator);
  return { domain: domain || "", platform: platform || "" };
};

const selectedComponentIds = computed(
  () =>
    new Set(
      config.value.components
        .map((entry) => componentIdFromEntry(entry))
        .filter(Boolean)
    )
);

const componentsHeader = computed(() => {
  if (activeComponentSlot.value === null) return "Components";
  const componentId = componentIdFromEntry(
    config.value.components[activeComponentSlot.value]
  );
  return componentId ? componentLabel(componentId) : "Add";
});

const schemaHelpUrl = (schema) => {
  const url = schema?.helpUrl;
  return typeof url === "string" ? url.trim() : "";
};

const activeTabHelpUrl = computed(() => {
  if (activeTab.value === "Core") {
    return schemaHelpUrl(esphomeCoreSchema.value) || schemaHelpUrl(substitutionsCoreSchema.value);
  }

  if (activeTab.value === "Platform") {
    return schemaHelpUrl(platformDetailSchema.value) || schemaHelpUrl(platformCoreSchema.value);
  }

  if (activeTab.value === "Network") {
    return schemaHelpUrl(networkDetailSchema.value) || schemaHelpUrl(networkCoreSchema.value);
  }

  if (activeTab.value === "Protocols") {
    return schemaHelpUrl(protocolsSchemas.value?.[activeProtocolKey.value]);
  }

  if (activeTab.value === "Busses") {
    return schemaHelpUrl(bussesSchemas.value?.[activeBussesKey.value]);
  }

  if (activeTab.value === "System") {
    return schemaHelpUrl(otherSchemas.value?.[activeOtherKey.value]);
  }

  if (activeTab.value === "Automation") {
    return schemaHelpUrl(automationSchemas.value?.[activeAutomationKey.value]);
  }

  if (activeTab.value === "Components") {
    if (activeComponentSlot.value === null) return "";
    const componentId = componentIdFromEntry(config.value.components[activeComponentSlot.value]);
    if (!componentId) return "";
    return schemaHelpUrl(componentSchemas.value?.[componentId]);
  }

  return "";
});

const activeComponentEntry = computed(() => {
  if (activeComponentSlot.value === null) return null;
  return config.value.components[activeComponentSlot.value] || null;
});

const activeComponentId = computed(() => componentIdFromEntry(activeComponentEntry.value));

const activeComponentConfig = computed(() => activeComponentEntry.value?.config || {});
const activeComponentCustomConfig = computed(
  () => activeComponentEntry.value?.customConfig || ""
);

const esphomeCoreId = "general/core/core";
const esphomeCoreConfig = computed(() => config.value.esphomeCore || {});
const substitutionsCoreId = "general/core/substitutions";
const substitutionsCoreConfig = computed(() => config.value.substitutions || {});
const platformCoreId = "general/platform/platform";
const platformCoreConfig = computed(() => config.value.platformCore || {});
const platformDetailId = computed(() => {
  const platform = platformCoreConfig.value?.platform;
  if (!platform) return "";
  return `general/platform/${platform}`;
});
const networkCoreId = "general/network/network";
const networkCoreConfig = computed(() => config.value.networkCore || {});
const networkDetailId = computed(() => {
  const transport = networkCoreConfig.value?.transport;
  if (!transport) return "";
  return `general/network/${transport}`;
});
const protocolsCoreConfig = computed(() => config.value.protocolsCore || {});
const protocolDefinitions = [
  { key: "api", label: "API", schemaId: "general/protocols/api" },
  { key: "mqtt", label: "MQTT", schemaId: "general/protocols/mqtt" },
  { key: "espnow", label: "ESP-NOW", schemaId: "general/protocols/esp-now" }
];
const activeProtocolKey = ref(protocolDefinitions[0]?.key || "");
const resolveProtocolEnabled = (key) => {
  const configEntry = protocolsCoreConfig.value?.[key] || {};
  if (configEntry.enabled !== undefined) return Boolean(configEntry.enabled);
  const schema = protocolsSchemas.value?.[key];
  const field = schema?.fields?.find((item) => item.key === "enabled");
  if (field?.default !== undefined) return Boolean(field.default);
  return false;
};
const enabledProtocolKeys = computed(() =>
  protocolDefinitions.filter((entry) => resolveProtocolEnabled(entry.key)).map((entry) => entry.key)
);
const protocolTabs = computed(() =>
  protocolDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const protocolDetailId = computed(() => {
  const entry = protocolDefinitions.find((item) => item.key === activeProtocolKey.value);
  return entry?.schemaId || "";
});
const protocolDetailConfig = computed(() => {
  if (!activeProtocolKey.value) return {};
  return protocolsCoreConfig.value?.[activeProtocolKey.value] || {};
});
const bussesCoreConfig = computed(() => config.value.bussesCore || {});
const bussesDefinitions = [
  { key: "i2c", label: "I2C", schemaId: "general/busses/i2c" },
  { key: "spi", label: "SPI", schemaId: "general/busses/spi" },
  { key: "uart", label: "UART", schemaId: "general/busses/uart" },
  { key: "one_wire", label: "1-Wire", schemaId: "general/busses/one_wire" },
  { key: "i2s", label: "I2S", schemaId: "general/busses/i2s" },
  { key: "canbus", label: "CAN Bus", schemaId: "general/busses/canbus" }
];
const supportedBusses = new Set(bussesDefinitions.map((entry) => entry.key));
const activeBussesKey = ref(bussesDefinitions[0]?.key || "");
const resolveBusEnabled = (key) => {
  const configEntry = bussesCoreConfig.value?.[key] || {};
  if (configEntry.enabled !== undefined) return Boolean(configEntry.enabled);
  const schema = bussesSchemas.value?.[key];
  const field = schema?.fields?.find((item) => item.key === "enabled");
  if (field?.default !== undefined) return Boolean(field.default);
  return false;
};
const activeComponentRequiredBusses = computed(() => {
  if (!activeComponentEntry.value) return [];
  const componentId = activeComponentId.value;
  if (!componentId || !componentSchemas.value?.[componentId]) return [];
  return Array.from(
    getRequiredInterfaces({
      components: [activeComponentEntry.value],
      componentSchemas: componentSchemas.value,
      supported: supportedBusses
    })
  );
});
const activeComponentBusLabels = computed(() => {
  if (!activeComponentRequiredBusses.value.length) return "";
  const labels = activeComponentRequiredBusses.value.map(
    (key) => bussesDefinitions.find((entry) => entry.key === key)?.label || key
  );
  return labels.join("/");
});
const primaryRequiredBusKey = computed(() => activeComponentRequiredBusses.value[0] || "");

const focusRequiredBus = () => {
  activeTab.value = "Busses";
  if (primaryRequiredBusKey.value) {
    activeBussesKey.value = primaryRequiredBusKey.value;
  }
};

const componentIdList = computed(() =>
  (config.value.components || []).map((entry) => componentIdFromEntry(entry)).filter(Boolean)
);

const triggerPulseIfComponentNeedsBus = (componentId) => {
  if (!componentId) return;
  const entry = (config.value.components || []).find(
    (item) => componentIdFromEntry(item) === componentId
  );
  if (!entry) return;
  const schema = componentSchemas.value?.[componentId];
  if (!schema) return;
  const required = getRequiredInterfaces({
    components: [entry],
    componentSchemas: componentSchemas.value,
    supported: supportedBusses
  });
  if (required.size) {
    triggerBusTabPulse();
  }
};

const triggerBusTabPulse = () => {
  if (busTabPulseTimer) {
    clearTimeout(busTabPulseTimer);
    busTabPulseTimer = null;
  }
  busTabPulse.value = false;
  requestAnimationFrame(() => {
    busTabPulse.value = true;
    busTabPulseTimer = setTimeout(() => {
      busTabPulse.value = false;
      busTabPulseTimer = null;
    }, 3000);
  });
};
const areComponentSchemasReady = computed(() => {
  const ids = config.value.components
    .map((entry) => componentIdFromEntry(entry))
    .filter(Boolean);
  if (!ids.length) return true;
  return ids.every((id) => componentSchemas.value[id]);
});
const requiredBusses = computed(() => {
  return getRequiredInterfaces({
    components: config.value.components,
    componentSchemas: componentSchemas.value,
    networkConfig: networkCoreConfig.value,
    networkSchema: networkDetailSchema.value,
    protocolsConfig: protocolsCoreConfig.value,
    enabledProtocols: enabledProtocolKeys.value,
    protocolsSchemas: protocolsSchemas.value,
    supported: supportedBusses
  });
});
const requiredBussesList = computed(() => Array.from(requiredBusses.value).sort());
const bussesTabs = computed(() =>
  bussesDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const bussesDetailId = computed(() => {
  const entry = bussesDefinitions.find((item) => item.key === activeBussesKey.value);
  return entry?.schemaId || "";
});
const bussesDetailConfig = computed(() => {
  if (!activeBussesKey.value) return {};
  return bussesCoreConfig.value?.[activeBussesKey.value] || {};
});
const otherDefinitions = [
  { key: "logger", label: "Logger", schemaId: "general/system/logger" },
  { key: "status_led", label: "Status LED", schemaId: "general/system/status_led" },
  { key: "debug", label: "Debug", schemaId: "general/system/debug" }
];
const systemConfig = computed(() => config.value.system || {});
const activeOtherKey = ref(otherDefinitions[0]?.key || "");
const otherTabs = computed(() =>
  otherDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const otherDetailId = computed(() => {
  const entry = otherDefinitions.find((item) => item.key === activeOtherKey.value);
  return entry?.schemaId || "";
});
const otherDetailConfig = computed(() => {
  if (!activeOtherKey.value) return {};
  const current = systemConfig.value?.[activeOtherKey.value] || {};
  return current;
});
const automationCoreConfig = computed(() => config.value.automation || {});
const automationDefinitions = [
  {
    key: "time",
    label: "Time",
    schemaId: "general/automation/time"
  },
  {
    key: "deep_sleep",
    label: "Deep Sleep",
    schemaId: "general/automation/deep_sleep"
  },
  { key: "script", label: "Script", schemaId: "general/automation/script" },
  {
    key: "globals",
    label: "Globals",
    schemaId: "general/automation/globals"
  },
  {
    key: "interval",
    label: "Interval",
    schemaId: "general/automation/interval"
  }
];
const activeAutomationKey = ref(automationDefinitions[0]?.key || "");
const automationTabs = computed(() =>
  automationDefinitions.map((entry) => ({ key: entry.key, label: entry.label }))
);
const automationDetailId = computed(() => {
  const entry = automationDefinitions.find((item) => item.key === activeAutomationKey.value);
  return entry?.schemaId || "";
});
const automationDetailSchema = computed(() => {
  if (!activeAutomationKey.value) return null;
  return automationSchemas.value?.[activeAutomationKey.value] || null;
});
const automationDetailConfig = computed(() => automationCoreConfig.value || {});
const automationItemFields = computed(() => {
  const key = activeAutomationKey.value;
  if (!key) return [];
  const fields = automationDetailSchema.value?.fields || [];
  const listField = fields.find((field) => field.key === key);
  return listField?.item?.fields || [];
});
const generatedAutomation = computed(() => ({
  time: [],
  deep_sleep: [],
  script: [],
  globals: [],
  interval: buildDisplayAnimationIntervals(
    config.value.components,
    componentSchemas.value,
    mdiSubstitutions.value
  )
}));
const showDisplayAutomationNotice = computed(() =>
  splitPreviewEnabled.value &&
  activePreviewTab.value === "display" &&
  (generatedAutomation.value?.interval || []).length > 0
);

const formatGeneratedLine = (entry, field) => {
  if (!field?.key) return "";
  const value = entry?.[field.key];
  if (value === undefined || value === null || value === "") return "";
  if (field.key === "then" && Array.isArray(value)) {
    if (!value.length) return "";
    const first = value[0] || {};
    const type = first.type || "";
    const id = first?.config?.id ? `: ${first.config.id}` : "";
    if (type && value.length === 1) return `then: ${type}${id}`;
    return `then: ${value.length} actions`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `${field.key}: ${value.length} items`;
  }
  if (typeof value === "object") {
    return `${field.key}: ${JSON.stringify(value)}`;
  }
  return `${field.key}: ${value}`;
};

const generatedEntryLines = (entry) =>
  automationItemFields.value
    .map((field) => formatGeneratedLine(entry, field))
    .filter(Boolean);
const platformForGpio = computed(() =>
  platformCoreConfig.value?.platform || config.value.device.platform
);
const platformVariantForGpio = computed(() =>
  platformCoreConfig.value?.variant || config.value.device.variant
);

const gpioGuideKey = computed(() =>
  resolveGpioKey(platformForGpio.value, platformVariantForGpio.value)
);

const gpioGuide = computed(() =>
  gpioGuideKey.value ? gpioData.value.sections?.[gpioGuideKey.value] || null : null
);

const gpioOptions = computed(() => gpioGuide.value?.rows || []);

const gpioTitle = computed(() => gpioGuide.value?.title || "GPIO Guide");

const mdiSubstitutions = ref({});
const displayImages = ref([]);
const mdiIcons = ref([]);

provide("mdiIcons", mdiIcons);

const idRegistry = computed(() =>
  buildValueRegistry(config.value.components, componentSchemas.value, (field, value) =>
    field.type === "id" && typeof value === "string" && value.trim()
  )
);

const idIndex = computed(() => buildIdIndex(config.value.components, componentSchemas.value));

const displayImageFiles = computed(() =>
  displayImages.value
    .map((item) => item?.file || "")
    .filter((file) => Boolean(file))
);

const displayAnimationFiles = computed(() =>
  displayImageFiles.value.filter((file) => file.toLowerCase().endsWith(".gif"))
);

const nameRegistry = computed(() =>
  buildValueRegistry(config.value.components, componentSchemas.value, (field, value) =>
    field.key === "name" && typeof value === "string" && value.trim()
  )
);

const duplicateErrors = computed(() =>
  buildDuplicateErrors(
    config.value.components,
    componentSchemas.value,
    idRegistry.value,
    nameRegistry.value
  )
);

const idRefErrors = computed(() =>
  buildIdRefErrors(
    config.value.components,
    componentSchemas.value,
    idIndex.value
  )
);

const displayElementIdErrors = computed(() =>
  buildDisplayElementIdErrors(
    config.value.components,
    componentSchemas.value,
    idIndex.value,
    displayImageFiles.value,
    displayAnimationFiles.value,
    mdiIcons.value
  )
);

const gpioUsageIndex = computed(() => {
  const transport = networkCoreConfig.value?.transport;
  const detailFields = networkDetailSchema.value?.fields || [];
  const detailConfig = transport ? config.value.networkCore || {} : null;
  const extraConfigs = detailConfig ? [{ config: detailConfig, fields: detailFields }] : [];

  const bussesExtra = [];
  bussesDefinitions.forEach((entry) => {
    if (!resolveBusEnabled(entry.key)) return;
    const schema = bussesSchemas.value?.[entry.key];
    if (!schema?.fields) return;
    bussesExtra.push({
      config: bussesCoreConfig.value?.[entry.key] || {},
      fields: schema.fields
    });
  });

  return buildGpioUsageIndex(
    config.value.components,
    componentSchemas.value,
    [...extraConfigs, ...bussesExtra]
  );
});

// Global registry for cross-schema visibility (globalDependsOn).
const globalStore = computed(() => {
  const entries = [];
  const pushEntry = (configValue, fields) => {
    if (Array.isArray(fields) && fields.length) {
      entries.push({ config: configValue, fields });
    }
  };

  pushEntry(esphomeCoreConfig.value, esphomeCoreSchema.value?.fields);
  pushEntry(substitutionsCoreConfig.value, substitutionsCoreSchema.value?.fields);
  pushEntry(platformCoreConfig.value, platformCoreSchema.value?.fields);
  pushEntry(platformCoreConfig.value, platformDetailSchema.value?.fields);
  pushEntry(networkCoreConfig.value, networkCoreSchema.value?.fields);
  pushEntry(networkCoreConfig.value, networkDetailSchema.value?.fields);
  pushEntry(systemConfig.value || {}, otherSchemas.value?.logger?.fields);
  pushEntry(systemConfig.value || {}, otherSchemas.value?.status_led?.fields);
  pushEntry(systemConfig.value || {}, otherSchemas.value?.debug?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.time?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.deep_sleep?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.script?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.globals?.fields);
  pushEntry(automationCoreConfig.value || {}, automationSchemas.value?.interval?.fields);

  (config.value.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const schema = componentSchemas.value?.[componentId];
    if (!schema?.fields) return;
    pushEntry(entry?.config || {}, schema.fields);
  });

  return buildGlobalRegistry(entries);
});

const validationErrors = computed(() => {
  const entries = [];
  const apiSchema = protocolsSchemas.value?.api || null;
  if (enabledProtocolKeys.value.includes("api") && apiSchema?.fields) {
    entries.push({
      label: "protocols.api",
      config: protocolsCoreConfig.value?.api || {},
      schema: apiSchema
    });
  }
  return buildValidationErrors(entries);
});

const formErrors = computed(() => [
  ...duplicateErrors.value,
  ...idRefErrors.value,
  ...displayElementIdErrors.value,
  ...validationErrors.value
]);

const previewMode = computed({
  get: () => (splitPreviewEnabled.value ? "tabs" : "single"),
  set: (value) => {
    splitPreviewEnabled.value = value === "tabs";
  }
});

watch(
  () => splitPreviewEnabled.value,
  (value) => {
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.splitPreview = Boolean(value);
    try {
      localStorage.setItem("vebBuilderSplitPreview", value ? "1" : "0");
    } catch (error) {
      console.error("Failed to store preview mode", error);
    }
    saveConfig();
  }
);

watch(
  () => activeModeLevel.value,
  (value) => {
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = resolveModeLevel(value);
    saveConfig();
  }
);

const openComponentViewer = (index) => {
  activeComponentSlot.value = index;
  activeTab.value = "Components";
  isComponentPickerOpen.value = false;
};

const addComponentSlot = () => {
  activeComponentSlot.value = config.value.components.length;
  activeTab.value = "Components";
  isComponentPickerOpen.value = true;
  componentsQuery.value = "";
};


const scrollPreviewTabs = (direction) => {
  if (direction < 0 && !canScrollLeft.value) return;
  if (direction > 0 && !canScrollRight.value) return;
  if (direction > 0) {
    previewTabStart.value = Math.min(
      previewTabStart.value + 1,
      Math.max(0, previewTabs.value.length - 1)
    );
    return;
  }
  previewTabStart.value = Math.max(0, previewTabStart.value - 1);
};

const handleSelectBlur = (event) => {
  event?.target?.blur?.();
};

const toggleProjectMenu = () => {
  projectMenuOpen.value = !projectMenuOpen.value;
};

const requestNewProject = () => {
  projectMenuOpen.value = false;
  confirmNewOpen.value = true;
};

const handleProjectMenuOutside = (event) => {
  if (!projectMenuOpen.value) return;
  const target = event.target;
  if (projectMenuRef.value && projectMenuRef.value.contains(target)) return;
  projectMenuOpen.value = false;
};

const handleNewProject = () => {
  confirmNewOpen.value = false;
  projectMenuOpen.value = false;
  isHydrating.value = true;
  config.value = defaultConfig();
  activeTab.value = tabs[0];
  activeComponentSlot.value = null;
  isComponentPickerOpen.value = false;
  componentsQuery.value = "";
  splitPreviewEnabled.value = Boolean(config.value.ui?.splitPreview);
  activeModeLevel.value = resolveModeLevel(config.value.ui?.modeLevel);
  isHydrating.value = false;
  try {
    localStorage.removeItem("vebBuilderDeviceConfig");
  } catch (error) {
    console.error("Failed to clear stored config", error);
  }
  lastSavedYamlName.value = "";
  lastSavedYamlBody.value = "";
};


const selectComponent = (item) => {
  if (activeComponentSlot.value === null) return;
  const index = activeComponentSlot.value;
  const existing = config.value.components[index];
  const existingId = componentIdFromEntry(existing);
  const nextEntry = {
    id: item.id,
    config: existingId === item.id ? existing?.config || {} : {},
    customConfig: existingId === item.id ? existing?.customConfig || "" : ""
  };
  if (index >= config.value.components.length) {
    config.value.components.push(nextEntry);
  } else {
    config.value.components.splice(index, 1, nextEntry);
  }
  ensureComponentSchema(item.id);
  isComponentPickerOpen.value = false;
};

const requestRemoveComponent = (index) => {
  pendingRemoveIndex.value = index;
  confirmOpen.value = true;
};

const confirmRemove = () => {
  if (pendingRemoveIndex.value === null) return;
  config.value.components.splice(pendingRemoveIndex.value, 1);
  activeComponentSlot.value = null;
  pendingRemoveIndex.value = null;
  confirmOpen.value = false;
  addComponentSlot();
  saveConfig();
};

const cancelRemove = () => {
  pendingRemoveIndex.value = null;
  confirmOpen.value = false;
};


watch(
  () => activeTab.value,
  (value) => {
    if (value !== "Components") {
      isComponentPickerOpen.value = false;
      componentsQuery.value = "";
    }
  }
);

const filteredCategories = computed(() => {
  const query = componentsQuery.value.trim().toLowerCase();
  return (componentCatalog.value?.categories || [])
    .map((category) => {
      const items = category.items.filter((item) => matchesQuery(item, query));
      const subcategories = category.subcategories
        .map((subcategory) => ({
          ...subcategory,
          items: subcategory.items.filter((item) => matchesQuery(item, query))
        }))
        .filter((subcategory) => subcategory.items.length > 0);
      return { ...category, items, subcategories };
    })
    .filter((category) => category.items.length > 0 || category.subcategories.length > 0);
});

// Lazy-load schema for a component when first needed.
const ensureComponentSchema = (componentId) => {
  if (!componentId || componentSchemas.value[componentId]) return;
  loadComponentSchema(componentId)
    .then((schema) => {
      componentSchemas.value = {
        ...componentSchemas.value,
        [componentId]: schema
      };
    })
    .catch(() => {
      componentSchemas.value = {
        ...componentSchemas.value,
        [componentId]: null
      };
    });
};

const defaultConfig = () => ({
  schemaVersion: 1,
  esphomeCore: {},
  substitutions: {},
  automation: {},
  system: {
    logger: {
      enabled: true,
      level: "DEBUG"
    }
  },
  platformCore: {
    platform: "esp32",
    variant: "esp32",
    framework: "esp-idf"
  },
  networkCore: {
    transport: "wifi"
  },
  protocolsCore: {},
  bussesCore: {},
  device: {
    friendlyName: "Kitchen Sensor",
    platform: "esp32",
    variant: "esp32",
    framework: "arduino"
  },
  components: [],
  ui: {
    splitPreview: false,
    modeLevel: "Simple",
    deviceHost: ""
  }
});

const resolveEmitModeForGeneration = (field) => {
  const mode = field?.emitYAML;
  if (mode === "never" || mode === "always" || mode === "visible" || mode === "dependsOn") {
    return mode;
  }
  if (field?.dependsOn || field?.globalDependsOn) return "dependsOn";
  return "visible";
};

const hasSatisfiedDependencies = (field, valueMap, schemaFields, globalStore) =>
  isSchemaFieldVisible(field, valueMap, schemaFields, globalStore);

const shouldConsiderFieldForGeneration = (field, valueMap, schemaFields, globalStore) => {
  const emitMode = resolveEmitModeForGeneration(field);
  if (emitMode === "never") return false;
  if (emitMode === "always") return true;
  const dependencySatisfied = hasSatisfiedDependencies(field, valueMap, schemaFields, globalStore);
  if (emitMode === "dependsOn") {
    if (field?.dependsOn || field?.globalDependsOn) return dependencySatisfied;
    return dependencySatisfied;
  }
  return dependencySatisfied;
};

const hasSufficientGeneratedValue = (value, spec) => {
  if (value === undefined || value === null) return false;
  const text = String(value);
  if (!text.trim()) return false;
  const minLength = Number(spec?.minLength) || 0;
  if (!minLength) return true;
  return text.length >= minLength;
};

const hasGeneratablePasswordCandidate = (fields, valueMap, globalStore) => {
  if (!Array.isArray(fields) || !fields.length) return false;

  return fields.some((field) => {
    const key = field?.key;
    if (!key) return false;
    if (!shouldConsiderFieldForGeneration(field, valueMap, fields, globalStore)) return false;

    if (field.type === "password") {
      const spec = resolveGenerationSpec(field);
      return spec.mode !== "none" && spec.onEmpty;
    }

    const currentValue = valueMap?.[key];
    if (field.type === "object") {
      const nestedValue =
        currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
          ? currentValue
          : {};
      return hasGeneratablePasswordCandidate(field.fields || [], nestedValue, globalStore);
    }

    if (
      field.type === "list" &&
      Array.isArray(currentValue) &&
      field.item?.type === "object" &&
      Array.isArray(field.item?.fields)
    ) {
      return currentValue.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry) &&
          hasGeneratablePasswordCandidate(field.item.fields, entry, globalStore)
      );
    }

    return false;
  });
};

const materializeGeneratedPasswordsInObject = (valueMap, fields, globalStore) => {
  if (!valueMap || typeof valueMap !== "object" || !Array.isArray(fields)) return false;

  let changed = false;

  fields.forEach((field) => {
    const key = field?.key;
    if (!key) return;
    if (!shouldConsiderFieldForGeneration(field, valueMap, fields, globalStore)) return;

    if (field.type === "password") {
      const spec = resolveGenerationSpec(field);
      if (spec.mode === "none" || !spec.onEmpty) return;
      const currentValue = valueMap[key];
      if (hasSufficientGeneratedValue(currentValue, spec)) return;
      const generated = generateFieldValue(field);
      if (!generated) return;
      valueMap[key] = generated;
      changed = true;
      return;
    }

    const currentValue = valueMap[key];

    if (field.type === "object") {
      let nestedValue =
        currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
          ? currentValue
          : null;
      if (!nestedValue) {
        const hasCandidate = hasGeneratablePasswordCandidate(field.fields || [], {}, globalStore);
        if (!hasCandidate) return;
        valueMap[key] = {};
        nestedValue = valueMap[key];
        changed = true;
      }
      if (materializeGeneratedPasswordsInObject(nestedValue, field.fields || [], globalStore)) {
        changed = true;
      }
      return;
    }

    if (
      field.type === "list" &&
      Array.isArray(currentValue) &&
      field.item?.type === "object" &&
      Array.isArray(field.item?.fields)
    ) {
      currentValue.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        if (materializeGeneratedPasswordsInObject(entry, field.item.fields, globalStore)) {
          changed = true;
        }
      });
    }
  });

  return changed;
};

const materializeGeneratedPasswordsBySchemas = () => {
  const targetConfig = config.value;
  if (!targetConfig || typeof targetConfig !== "object") return false;

  const currentGlobalStore = globalStore.value || {};
  let changed = false;

  const processRootSection = (container, key, fields) => {
    if (!Array.isArray(fields) || !fields.length) return;
    if (!container || typeof container !== "object") return;

    let sectionValue = container[key];
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
      if (!hasGeneratablePasswordCandidate(fields, {}, currentGlobalStore)) return;
      container[key] = {};
      sectionValue = container[key];
      changed = true;
    }

    if (materializeGeneratedPasswordsInObject(sectionValue, fields, currentGlobalStore)) {
      changed = true;
    }
  };

  processRootSection(targetConfig, "esphomeCore", esphomeCoreSchema.value?.fields || []);
  processRootSection(targetConfig, "substitutions", substitutionsCoreSchema.value?.fields || []);
  processRootSection(targetConfig, "platformCore", platformCoreSchema.value?.fields || []);
  if (targetConfig.platformCore && typeof targetConfig.platformCore === "object") {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.platformCore,
        platformDetailSchema.value?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  }

  processRootSection(targetConfig, "networkCore", networkCoreSchema.value?.fields || []);
  if (targetConfig.networkCore && typeof targetConfig.networkCore === "object") {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.networkCore,
        networkDetailSchema.value?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  }

  if (!targetConfig.protocolsCore || typeof targetConfig.protocolsCore !== "object") {
    targetConfig.protocolsCore = {};
    changed = true;
  }
  protocolDefinitions.forEach((entry) => {
    processRootSection(targetConfig.protocolsCore, entry.key, protocolsSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.bussesCore || typeof targetConfig.bussesCore !== "object") {
    targetConfig.bussesCore = {};
    changed = true;
  }
  bussesDefinitions.forEach((entry) => {
    processRootSection(targetConfig.bussesCore, entry.key, bussesSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.system || typeof targetConfig.system !== "object") {
    targetConfig.system = {};
    changed = true;
  }
  otherDefinitions.forEach((entry) => {
    processRootSection(targetConfig.system, entry.key, otherSchemas.value?.[entry.key]?.fields || []);
  });

  if (!targetConfig.automation || typeof targetConfig.automation !== "object") {
    targetConfig.automation = {};
    changed = true;
  }
  automationDefinitions.forEach((entry) => {
    if (
      materializeGeneratedPasswordsInObject(
        targetConfig.automation,
        automationSchemas.value?.[entry.key]?.fields || [],
        currentGlobalStore
      )
    ) {
      changed = true;
    }
  });

  (targetConfig.components || []).forEach((entry) => {
    const componentId = componentIdFromEntry(entry);
    if (!componentId) return;
    const fields = componentSchemas.value?.[componentId]?.fields || [];
    if (!fields.length) return;
    if (!entry.config || typeof entry.config !== "object") {
      entry.config = {};
      changed = true;
    }
    if (materializeGeneratedPasswordsInObject(entry.config, fields, currentGlobalStore)) {
      changed = true;
    }
  });

  return changed;
};

const config = ref(defaultConfig());
const isHydrating = ref(true);
let isMaterializingGeneratedPasswords = false;

const gpioGuideFallbackTitle = computed(() => {
  if (gpioGuide.value?.title) return gpioGuide.value.title;
  if (platformForGpio.value === "esp8266") return "ESP8266";
  if (platformForGpio.value === "esp32") {
    return platformVariantForGpio.value || "esp32";
  }
  return "";
});

watch(
  () => config.value.components.map((entry) => componentIdFromEntry(entry)),
  (ids) => {
    ids.filter(Boolean).forEach((id) => ensureComponentSchema(id));
  },
  { immediate: true }
);

watch(
  () => formErrors.value.length,
  (count) => {
    if (!count) {
      exportErrorOpen.value = false;
    }
  }
);

watch(
  () => config.value,
  () => {
    if (isHydrating.value) return;
    if (isMaterializingGeneratedPasswords) return;
    isMaterializingGeneratedPasswords = true;
    try {
      materializeGeneratedPasswordsBySchemas();
    } finally {
      isMaterializingGeneratedPasswords = false;
    }
  },
  { deep: true, immediate: true }
);

watch(
  () => [
    esphomeCoreSchema.value,
    substitutionsCoreSchema.value,
    platformCoreSchema.value,
    platformDetailSchema.value,
    networkCoreSchema.value,
    networkDetailSchema.value,
    protocolsSchemas.value,
    bussesSchemas.value,
    otherSchemas.value,
    automationSchemas.value,
    componentSchemas.value
  ],
  () => {
    if (isHydrating.value) return;
    if (isMaterializingGeneratedPasswords) return;
    isMaterializingGeneratedPasswords = true;
    try {
      materializeGeneratedPasswordsBySchemas();
    } finally {
      isMaterializingGeneratedPasswords = false;
    }
  },
  { deep: true }
);


// Safe stringify to avoid circular refs breaking persistence/preview.
const safeStringify = (value) => {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === "function") return undefined;
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return undefined;
        seen.add(val);
      }
      return val;
    },
    2
  );
};

const jsonPreview = computed(() => safeStringify(config.value));

// Keep only keys that exist in the schema (used before YAML generation).
const filterConfigBySchema = (sourceValue, fields) => {
  if (!sourceValue || typeof sourceValue !== "object") return {};
  const filtered = {};
  (fields || []).forEach((field) => {
    if (!field?.key) return;
    const value = sourceValue[field.key];
    if (value === undefined) return;
    if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      filtered[field.key] = filterConfigBySchema(value, field.fields || []);
      return;
    }
    if (field.type === "list" && Array.isArray(value) && field.item?.fields) {
      filtered[field.key] = value.map((item) => {
        if (item && typeof item === "object") {
          return filterConfigBySchema(item, field.item.fields || []);
        }
        return item;
      });
      return;
    }
    filtered[field.key] = value;
  });
  return filtered;
};

const shouldEmitEmptyBlock = (fields) => {
  const schemaFields = Array.isArray(fields) ? fields : [];
  if (!schemaFields.length) return false;
  return !schemaFields.some((field) => field.required);
};

// Generate the full YAML preview from config + schemas.
const yamlPreview = computed(() => {
  const lines = [];
  const substitutionsValue = config.value.substitutions || {};
  const substitutionsFields = substitutionsCoreSchema.value?.fields || [];
  if (substitutionsFields.length) {
    const filteredSubstitutionsValue = filterConfigBySchema(
      substitutionsValue,
      substitutionsFields
    );
    const substitutionLines = buildSchemaYaml(
      filteredSubstitutionsValue,
      substitutionsFields,
      0,
      config.value,
      globalStore.value
    );
    if (substitutionLines.length) {
      lines.push(...substitutionLines);
    }
  }
  const coreValue = config.value.esphomeCore || {};
  const coreFields = esphomeCoreSchema.value?.fields || [];
  if (coreFields.length) {
    const filteredCoreValue = filterConfigBySchema(coreValue, coreFields);
    const coreLines = buildSchemaYaml(
      filteredCoreValue,
      coreFields,
      2,
      config.value,
      globalStore.value
    );
    if (coreLines.length) {
      lines.push("");
      lines.push("esphome:");
      lines.push(...coreLines);
    }
  }

  const platformName = platformCoreConfig.value?.platform;
  const detailFields = platformDetailSchema.value?.fields || [];
  if (platformName && detailFields.length) {
    lines.push("");
    lines.push(`${platformName}:`);

    if (platformName === "esp32") {
      const {
        platform,
        framework,
        framework_config,
        advanced,
        components,
        ...rest
      } = platformCoreConfig.value || {};
      const esp32Fields = detailFields.filter(
        (field) =>
          ![
            "framework",
            "framework_config",
            "advanced",
            "components"
          ].includes(field.key)
      );
      const baseLines = buildSchemaYaml(rest, esp32Fields, 2, config.value, globalStore.value);
      if (baseLines.length) {
        lines.push(...baseLines);
      }
      const frameworkConfig = framework_config || {};
      const hasFramework = framework || Object.keys(frameworkConfig).length;
      const hasAdvanced = advanced && Object.keys(advanced).length;
      const hasComponents = Array.isArray(components) && components.length;
      if (hasFramework || hasAdvanced || hasComponents) {
        lines.push("  framework:");
        if (framework) {
          lines.push(`    type: ${framework}`);
        }
        const frameworkField = detailFields.find((field) => field.key === "framework_config");
        const advancedField = detailFields.find((field) => field.key === "advanced");
        const componentsField = detailFields.find((field) => field.key === "components");
        const frameworkFields = [
          ...(frameworkField?.fields || []),
          ...(advancedField ? [advancedField] : []),
          ...(componentsField ? [componentsField] : [])
        ];
        const frameworkValue = {
          ...frameworkConfig,
          ...(hasAdvanced ? { advanced } : {}),
          ...(hasComponents ? { components } : {})
        };
        const frameworkLines = buildSchemaYaml(
          frameworkValue,
          frameworkFields,
          4,
          config.value,
          globalStore.value
        );
        if (frameworkLines.length) {
          lines.push(...frameworkLines);
        }
      }
    } else {
      const { platform, ...rest } = platformCoreConfig.value || {};
      lines.push(...buildSchemaYaml(rest, detailFields, 2, config.value, globalStore.value));
    }
  }

  const networkTransport = networkCoreConfig.value?.transport;
  const networkCoreFields = networkCoreSchema.value?.fields || [];
  const networkFields = networkDetailSchema.value?.fields || [];
  if (networkTransport && networkFields.length) {
    const { transport, ...rawNetworkConfig } = networkCoreConfig.value || {};
    const networkConfig = filterConfigBySchema(rawNetworkConfig, networkFields);
    const coreNetworkConfig = filterConfigBySchema(rawNetworkConfig, networkCoreFields);
    let captivePortalEnabled = false;
    let webServerConfig = null;
    let webServerFields = [];
    let webServerEnabled = false;

    if (networkTransport === "wifi") {
      const apConfig = networkConfig.ap;
      if (apConfig && typeof apConfig === "object") {
        const apEnabled = apConfig.enabled !== undefined ? apConfig.enabled : true;
        if (apEnabled === false) {
          delete networkConfig.ap;
        } else {
          const { enabled, captive_portal, ...apRest } = apConfig;
          captivePortalEnabled =
            captive_portal !== undefined ? Boolean(captive_portal) : true;
          networkConfig.ap = Object.keys(apRest).length ? apRest : {};
        }
      }
    }

    const webServerField = networkCoreFields.find((field) => field.key === "web_server");
    webServerFields = webServerField?.fields || [];
    const rawWebServer = coreNetworkConfig.web_server;
    if (rawWebServer && typeof rawWebServer === "object") {
      webServerEnabled =
        rawWebServer.enabled !== undefined ? Boolean(rawWebServer.enabled) : false;
      if (webServerEnabled) {
        const { enabled, ...rest } = rawWebServer;
        webServerConfig = rest;
      }
    }

    const networkLines = buildSchemaYaml(
      networkConfig,
      networkFields,
      2,
      config.value,
      globalStore.value
    );
    if (networkLines.length) {
      if (networkTransport === "wifi") {
        const apIndex = networkLines.findIndex(
          (line) => line.startsWith("  ") && line.trimStart().startsWith("ap:")
        );
        if (apIndex !== -1) {
          const apBlock = [networkLines.splice(apIndex, 1)[0]];
          while (apIndex < networkLines.length && networkLines[apIndex].startsWith("    ")) {
            apBlock.push(networkLines.splice(apIndex, 1)[0]);
          }
          if (networkLines.length && networkLines[networkLines.length - 1].trim() !== "") {
            networkLines.push("");
          }
          networkLines.push(
            "  # Enable fallback hotspot (captive portal) in case wifi connection fails",
            ...apBlock
          );
        }
      }
      lines.push("");
      lines.push(`${networkTransport}:`);
      lines.push(...networkLines);
      if (networkTransport === "wifi" && captivePortalEnabled) {
        lines.push("");
        lines.push("captive_portal:");
      }
      const otaConfig = networkCoreConfig.value?.ota || null;
      const otaEnabled = otaConfig?.enabled ?? true;
      const otaPasswordEnabled = otaConfig?.use_password ?? true;
      const otaPassword = otaConfig?.password?.trim();
      if (otaEnabled) {
        lines.push("");
        lines.push("ota:");
        lines.push("  - platform: esphome");
        if (otaPasswordEnabled && otaPassword) {
          lines.push(`    password: \"${otaPassword}\"`);
        }
      }
      if (webServerEnabled) {
        lines.push("");
        lines.push("web_server:");
        if (webServerFields.length) {
          const webServerLines = buildSchemaYaml(
            webServerConfig || {},
            webServerFields,
            2,
            config.value,
            globalStore.value
          );
          if (webServerLines.length) {
            lines.push(...webServerLines);
          }
        }
      }
    }
  }

  const protocolConfig = protocolsCoreConfig.value || {};
  const protocolSchemaMap = protocolsSchemas.value || {};
  protocolDefinitions.forEach((entry) => {
    if (!enabledProtocolKeys.value.includes(entry.key)) return;
    const schema = protocolSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const protocolValue = filterConfigBySchema(protocolConfig[entry.key] || {}, fields);
    const protocolLines = buildSchemaYaml(protocolValue, fields, 2, config.value, globalStore.value);
    if (!protocolLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.key}:`);
    if (protocolLines.length) {
      lines.push(...protocolLines);
    }
  });

const otherSchemaMap = otherSchemas.value || {};
const otherConfig = systemConfig.value || {};

  const appendOtherSection = (sectionKey, label, configValue) => {
    const schema = otherSchemaMap[sectionKey];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const filteredValue = filterConfigBySchema(configValue || {}, fields);
    const sectionLines = buildSchemaYaml(
      filteredValue,
      fields,
      2,
      config.value,
      globalStore.value
    );
    if (!sectionLines.length) return;
    lines.push("");
    lines.push(`${label}:`);
    lines.push(...sectionLines);
  };

  const otherEntries = [
    { key: "logger", label: "logger" },
    { key: "status_led", label: "status_led" },
    { key: "debug", label: "debug" }
  ];
  otherEntries.forEach((entry) => {
    const schema = otherSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const configValue = otherConfig[entry.key] || {};
    if (!configValue.enabled) return;
    const filteredValue = filterConfigBySchema(configValue || {}, fields);
    const sectionLines = buildSchemaYaml(
      filteredValue,
      fields,
      2,
      config.value,
      globalStore.value
    );
    if (!sectionLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.label}:`);
    lines.push(...sectionLines);
  });

  const automationSchemaMap = automationSchemas.value || {};
  const automationConfig = automationCoreConfig.value || {};
  const generated = generatedAutomation.value || {};

  const appendAutomationSection = (sectionKey, label, configValue) => {
    const schema = automationSchemaMap[sectionKey];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const filteredValue = filterConfigBySchema(configValue || {}, fields);
    const sectionLines = buildSchemaYaml(
      filteredValue,
      fields,
      2,
      config.value,
      globalStore.value
    );
    if (!sectionLines.length) return;
    lines.push("");
    lines.push(`${label}:`);
    lines.push(...sectionLines);
  };

  const buildAutomationListLines = (items, itemFields) => {
    const listLines = [];
    items.forEach((item) => {
      const objectLines = buildSchemaYaml(
        item || {},
        itemFields,
        4,
        config.value,
        globalStore.value
      );
      if (!objectLines.length) {
        listLines.push("  - {}");
        return;
      }
      const prefix = "  - ";
      const firstLine = objectLines[0];
      listLines.push(`${prefix}${firstLine.slice(4)}`);
      objectLines.slice(1).forEach((line) => listLines.push(line));
    });
    return listLines;
  };

  const normalizeAutomationItems = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  };

  automationDefinitions.forEach((entry) => {
    const schema = automationSchemaMap[entry.key];
    const fields = schema?.fields || [];
    const listField = fields.find((field) => field.key === entry.key);
    const itemFields = listField?.item?.fields || [];
    const generatedItems = normalizeAutomationItems(generated[entry.key]);
    const manualItems = normalizeAutomationItems(automationConfig[entry.key]);
    if (!itemFields.length || (!generatedItems.length && !manualItems.length)) return;
    lines.push("");
    lines.push(`${entry.key}:`);
    if (generatedItems.length) {
      lines.push("  # Auto-generated");
      lines.push(...buildAutomationListLines(generatedItems, itemFields));
    }
    if (manualItems.length) {
      if (generatedItems.length) {
        lines.push("  # Added by user");
      }
      lines.push(...buildAutomationListLines(manualItems, itemFields));
    }
  });

  const bussesConfig = bussesCoreConfig.value || {};
  const bussesSchemaMap = bussesSchemas.value || {};
  const bussesEntries = [
    { key: "i2c", label: "i2c" },
    { key: "spi", label: "spi" },
    { key: "uart", label: "uart" },
    { key: "one_wire", label: "one_wire" },
    { key: "i2s", label: "i2s" },
    { key: "canbus", label: "canbus" }
  ];
  bussesEntries.forEach((entry) => {
    const definition = bussesDefinitions.find((item) => item.key === entry.key);
    if (!definition || !resolveBusEnabled(entry.key)) return;
    const schema = bussesSchemaMap[entry.key];
    const fields = schema?.fields || [];
    if (!fields.length) return;
    const busValue = filterConfigBySchema(bussesConfig[entry.key] || {}, fields);
    const busLines = buildSchemaYaml(busValue, fields, 2, config.value, globalStore.value);
    if (!busLines.length && !shouldEmitEmptyBlock(fields)) return;
    lines.push("");
    lines.push(`${entry.label}:`);
    lines.push(...busLines);
  });

  const componentLines = buildComponentsYaml(
    config.value.components,
    componentSchemas.value,
    globalStore.value,
    mdiSubstitutions.value
  );
  if (componentLines.length) {
    lines.push("");
    lines.push(...componentLines);
  }

  while (lines.length && lines[0].trim() === "") {
    lines.shift();
  }

  return lines.join("\n");
});

const parseYamlBlocks = (yamlText) => {
  const blocks = [];
  const lines = (yamlText || "").split(/\r?\n/);
  let current = null;

  const isTopLevelKey = (line) => {
    if (!line || /^\s/.test(line)) return false;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return false;
    return trimmed.includes(":");
  };

  lines.forEach((line) => {
    if (isTopLevelKey(line)) {
      if (current) blocks.push(current);
      const key = line.split(":")[0].trim();
      current = { key, lines: [line] };
      return;
    }
    if (current) {
      current.lines.push(line);
    }
  });

  if (current) blocks.push(current);
  return blocks;
};

const yamlBlocks = computed(() => parseYamlBlocks(yamlPreview.value));

const coreBlockKeys = computed(() => {
  const keys = new Set([
    "esphome",
    "substitutions",
    "ota",
    "api",
    "mqtt",
    "espnow",
    "captive_portal",
    "web_server",
    "logger",
    "status_led",
    "debug"
  ]);
  const platformName = platformCoreConfig.value?.platform;
  if (platformName) keys.add(platformName);
  const networkTransport = networkCoreConfig.value?.transport;
  if (networkTransport) keys.add(networkTransport);
  return keys;
});

const substitutionsBlockKeys = new Set([
  "font",
  "image",
  "images",
  "graph",
  "animation"
]);

const automationBlockKeys = new Set([
  "time",
  "deep_sleep",
  "script",
  "globals",
  "interval"
]);
const bussesBlockKeys = computed(
  () => new Set(bussesDefinitions.map((entry) => entry.key))
);

const titleCase = (value) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const humanizePreviewKey = (key) => {
  const map = {
    api: "API",
    ota: "OTA",
    mqtt: "MQTT",
    espnow: "ESP-NOW",
    esphome: "ESPHome",
    i2c: "I2C",
    spi: "SPI",
    uart: "UART",
    i2s: "I2S",
    one_wire: "1-Wire",
    canbus: "CAN Bus",
    status_led: "Status LED",
    web_server: "Web Server"
  };
  if (map[key]) return map[key];
  const normalized = key.replace(/[_-]+/g, " ").trim();
  return titleCase(normalized);
};

const buildPreviewText = (blocks = []) => {
  const parts = blocks.map((block) => block.lines.join("\n").replace(/\n+$/g, ""));
  return parts.join("\n\n").trim();
};

const previewTabs = computed(() => {
  const blocks = yamlBlocks.value;
  const used = new Set();
  const tabs = [];

  const coreBlocks = blocks.filter((block) => coreBlockKeys.value.has(block.key));
  if (coreBlocks.length) {
    tabs.push({ key: "core", label: "Core", blocks: coreBlocks });
    coreBlocks.forEach((block) => used.add(block.key));
  }

  const automationBlocks = blocks.filter((block) => automationBlockKeys.has(block.key));
  if (automationBlocks.length) {
    tabs.push({ key: "automation", label: "Automation", blocks: automationBlocks });
    automationBlocks.forEach((block) => used.add(block.key));
  }

  const bussesBlocks = blocks.filter((block) => bussesBlockKeys.value.has(block.key));
  if (bussesBlocks.length) {
    tabs.push({ key: "busses", label: "Busses", blocks: bussesBlocks });
    bussesBlocks.forEach((block) => used.add(block.key));
  }

  const substitutionsBlocks = blocks.filter((block) => substitutionsBlockKeys.has(block.key));
  const displayBlocks = blocks.filter((block) => block.key === "display");
  const combinedDisplayBlocks = [...substitutionsBlocks, ...displayBlocks];
  if (combinedDisplayBlocks.length) {
    tabs.push({ key: "display", label: "Display", blocks: combinedDisplayBlocks });
    combinedDisplayBlocks.forEach((block) => used.add(block.key));
  }

  blocks.forEach((block) => {
    if (used.has(block.key)) return;
    tabs.push({ key: block.key, label: humanizePreviewKey(block.key), blocks: [block] });
    used.add(block.key);
  });

  return tabs;
});

onBeforeUpdate(() => {
  previewTabMeasureButtons.value = [];
});

const updatePreviewTabLayout = async () => {
  await nextTick();
  const list = previewTabList.value;
  previewTabAvailableWidth.value = list?.clientWidth || 0;
  previewTabWidths.value = previewTabMeasureButtons.value.map(
    (button) => button?.offsetWidth || 0
  );
  if (previewTabStart.value >= previewTabs.value.length) {
    previewTabStart.value = 0;
  }
};

const previewTabGap = 4;

const calcStartForEndIndex = (endIndex) => {
  const widths = previewTabWidths.value;
  const available = previewTabAvailableWidth.value;
  if (!widths.length || available <= 0) return Math.max(0, endIndex);
  let total = 0;
  let start = endIndex;
  for (let i = endIndex; i >= 0; i -= 1) {
    const width = widths[i] || 0;
    const nextTotal = i === endIndex ? width : total + previewTabGap + width;
    if (nextTotal > available) break;
    total = nextTotal;
    start = i;
  }
  return start;
};

const visiblePreviewTabs = computed(() => {
  const tabs = previewTabs.value;
  const widths = previewTabWidths.value;
  const available = previewTabAvailableWidth.value;
  if (!tabs.length) return [];
  let total = 0;
  const start = Math.min(previewTabStart.value, tabs.length - 1);
  const visible = [];
  for (let i = start; i < tabs.length; i += 1) {
    const width = widths[i] || 0;
    const nextTotal = visible.length ? total + previewTabGap + width : total + width;
    if (nextTotal > available) break;
    total = nextTotal;
    visible.push(tabs[i]);
  }
  return visible;
});

const lastVisibleTabIndex = computed(() => {
  if (!visiblePreviewTabs.value.length) return -1;
  return previewTabStart.value + visiblePreviewTabs.value.length - 1;
});

const canScrollLeft = computed(() => previewTabStart.value > 0);
const canScrollRight = computed(() =>
  lastVisibleTabIndex.value >= 0 && lastVisibleTabIndex.value < previewTabs.value.length - 1
);

const ensurePreviewTabVisible = (index) => {
  if (index < previewTabStart.value) {
    previewTabStart.value = index;
    return;
  }
  if (index > lastVisibleTabIndex.value) {
    previewTabStart.value = calcStartForEndIndex(index);
  }
};

const switchPreviewTab = async (key) => {
  const index = previewTabs.value.findIndex((tab) => tab.key === key);
  if (index === -1) return;
  activePreviewTab.value = key;
  await updatePreviewTabLayout();
  ensurePreviewTabVisible(index);
};

const resolvePreviewTabKeyFromMain = () => {
  if (activeTab.value === "Busses") return "busses";
  if (activeTab.value === "Automation") return "automation";
  if (activeTab.value === "Components") {
    const { domain } = parseComponentId(activeComponentId.value || "");
    if (!domain) return "";
    return domain === "display" ? "display" : domain;
  }
  return "core";
};

const syncPreviewTabToMain = async () => {
  if (!splitPreviewEnabled.value) return;
  const targetKey = resolvePreviewTabKeyFromMain();
  if (!targetKey) return;
  const index = previewTabs.value.findIndex((tab) => tab.key === targetKey);
  if (index === -1) return;
  activePreviewTab.value = previewTabs.value[index].key;
  await updatePreviewTabLayout();
  ensurePreviewTabVisible(index);
};

watch(
  () => previewTabs.value,
  async (tabs) => {
    const keys = tabs.map((tab) => tab.key);
    const previousKeys = lastPreviewTabKeys.value;
    const previousSet = new Set(previousKeys);
    const addedKey = keys.find((key) => !previousSet.has(key));
    lastPreviewTabKeys.value = keys;
    if (!splitPreviewEnabled.value) return;
    if (!previousKeys.length) {
      await updatePreviewTabLayout();
      await syncPreviewTabToMain();
      return;
    }
    if (!addedKey) return;
    if (isHydrating.value) return;
    if (addedKey === "busses") return;
    const addedIndex = keys.indexOf(addedKey);
    if (addedIndex === -1) return;
    activePreviewTab.value = addedKey;
    await updatePreviewTabLayout();
    previewTabStart.value = calcStartForEndIndex(addedIndex);
  },
  { immediate: true }
);

watch(
  () => [activeTab.value, activeComponentId.value],
  () => {
    syncPreviewTabToMain();
  }
);

watch(
  () => splitPreviewEnabled.value,
  (enabled) => {
    if (enabled) {
      syncPreviewTabToMain();
    }
  }
);


const previewContent = computed(() => {
  if (!splitPreviewEnabled.value) return yamlPreview.value;
  const selected = previewTabs.value.find((tab) => tab.key === activePreviewTab.value);
  if (!selected) return "";
  return buildPreviewText(selected.blocks);
});

const updatePreviewScrollbar = () => {
  const el = previewScrollInner.value;
  if (!el) {
    hasPreviewScrollbar.value = false;
    return;
  }
  const hasVertical = el.scrollHeight > el.clientHeight + 1;
  const hasHorizontal = el.scrollWidth > el.clientWidth + 1;
  hasPreviewScrollbar.value = hasVertical || hasHorizontal;
};

const copyLabel = computed(() => (copySuccess.value ? "Copied" : "Copy code"));

const handleCopyPreview = async () => {
  const text = previewContent.value || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copySuccess.value = true;
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
    }
    copyResetTimer = setTimeout(() => {
      copySuccess.value = false;
      copyResetTimer = null;
    }, 1500);
  } catch (error) {
    console.error("Failed to copy preview", error);
  }
};

watch(
  () => [splitPreviewEnabled.value, previewTabs.value],
  ([enabled, tabs]) => {
    if (!enabled) return;
    if (!tabs.length) {
      activePreviewTab.value = "";
      return;
    }
    const exists = tabs.some((tab) => tab.key === activePreviewTab.value);
    if (!exists) {
      activePreviewTab.value = tabs[0].key;
    }
    updatePreviewTabLayout();
  },
  { immediate: true }
);

watch(
  () => [previewContent.value, splitPreviewEnabled.value, activePreviewTab.value],
  async () => {
    await nextTick();
    updatePreviewScrollbar();
  },
  { immediate: true }
);

onMounted(() => {
  updatePreviewScrollbar();
  initProjectsUpdatedChannel();
  window.addEventListener("resize", updatePreviewScrollbar);
  window.addEventListener("app:builder-export", handleAppExport);
  window.addEventListener("app:builder-compile", handleAppCompile);
  window.addEventListener("app:builder-install", handleAppInstall);
  window.addEventListener("app:builder-logs", handleAppLogs);
  emitCompileState();
  refreshCurrentDeviceStatus();
  startDeviceStatusPolling();
});

watch(
  () => splitPreviewEnabled.value,
  () => {
    updatePreviewTabLayout();
  }
);

watch(
  () => previewTabs.value.length,
  () => {
    updatePreviewTabLayout();
  }
);

const highlightedYaml = computed(() => {
  const source = previewContent.value || "";
  return hljs.highlight(source, { language: "yaml" }).value;
});


const exportYaml = () => {
  if (formErrors.value.length) {
    exportErrorOpen.value = true;
    return;
  }
  const blob = new Blob([yamlPreview.value], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = projectFilename.value || "config.yaml";
  anchor.click();
  URL.revokeObjectURL(url);
};

const handleAppExport = () => {
  exportYaml();
};

const saveConfig = () => {
  if (isHydrating.value) return;
  try {
    const payload = safeStringify(config.value);
    localStorage.setItem("vebBuilderDeviceConfig", payload);
  } catch (error) {
    console.error("Failed to save config", error);
  }
};

const ADDON_ROOT_FOLDER_ID = "root";
const ADDON_ROOT_FOLDER_LABEL = "Projects";
const PROJECTS_UPDATED_STORAGE_KEY = "vebProjectsUpdatedSignal";
const PROJECTS_UPDATED_CHANNEL = "ecd-projects";
const addonBaseUrl = new URL("./", window.location.href).toString();

const buildAddonUrl = (path) => new URL(path, addonBaseUrl).toString();

const addonFetch = async (path, options = {}) => {
  return fetch(buildAddonUrl(path), {
    credentials: "include",
    ...options
  });
};

const initProjectsUpdatedChannel = () => {
  if (!("BroadcastChannel" in window) || projectsUpdatedChannel) return;
  try {
    projectsUpdatedChannel = new BroadcastChannel(PROJECTS_UPDATED_CHANNEL);
  } catch {
    projectsUpdatedChannel = null;
  }
};

const closeProjectsUpdatedChannel = () => {
  if (!projectsUpdatedChannel) return;
  projectsUpdatedChannel.close();
  projectsUpdatedChannel = null;
};

const emitProjectsUpdated = () => {
  const payload = { type: "projects-updated", ts: Date.now() };
  window.dispatchEvent(new CustomEvent("app:projects-updated", { detail: payload }));
  if (projectsUpdatedChannel) {
    projectsUpdatedChannel.postMessage(payload);
  }
  try {
    localStorage.setItem(PROJECTS_UPDATED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

const isPrivateIp = (host) => {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((value) => Number(value));
  if (nums.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return false;
  if (nums[0] === 10) return true;
  if (nums[0] === 127) return true;
  if (nums[0] === 192 && nums[1] === 168) return true;
  if (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) return true;
  return false;
};

const isLocalHostname = (host) => {
  if (!host) return false;
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local")) return true;
  if (normalized === "::1" || normalized === "[::1]") return true;
  return isPrivateIp(normalized);
};

const preferCompileLongPoll = !isLocalHostname(window.location.hostname || "");
const compileMaxLogLines = 5000;
const compileLogChunkSize = 200;
const compileMaxReconnectAttempts = 6;

const currentYamlDeviceName = computed(() => String(projectFilename.value || "").replace(/\.yaml$/i, ""));
const hostFromYamlName = (yamlName) => {
  const normalized = String(yamlName || "").trim();
  if (!normalized) return "";
  const deviceName = normalized.replace(/\.yaml$/i, "").trim();
  return deviceName ? `${deviceName}.local` : "";
};
const savedDeviceHost = computed(() => String(config.value?.ui?.deviceHost || "").trim());
const preferredDeviceHost = computed(() => {
  const explicit = savedDeviceHost.value;
  if (explicit) return explicit;
  return hostFromYamlName(projectFilename.value);
});

const registerCurrentDevice = async (yamlName) => {
  if (!yamlName) return;
  try {
    const host = hostFromYamlName(yamlName);
    await addonFetch("api/devices/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        yaml: yamlName,
        ...(host ? { host } : {})
      })
    });
  } catch {
    // ignore registration errors
  }
};

const refreshCurrentDeviceStatus = async ({ refresh = false } = {}) => {
  const yamlName = String(projectFilename.value || "").trim();
  if (!yamlName) {
    projectDeviceStatus.value = "unknown";
    projectDeviceHost.value = "";
    projectDeviceName.value = "";
    return;
  }

  try {
    const response = await addonFetch(`api/devices/list?refresh=${refresh ? 1 : 0}`);
    if (!response.ok) {
      projectDeviceStatus.value = "unknown";
      return;
    }
    const payload = await response.json();
    const devices = Array.isArray(payload?.devices) ? payload.devices : [];
    const fallbackName = currentYamlDeviceName.value;
    const match = devices.find((device) => {
      const deviceYaml = String(device?.yaml || "").trim();
      const deviceName = String(device?.name || "").trim();
      if (deviceYaml && deviceYaml.toLowerCase() === yamlName.toLowerCase()) return true;
      if (deviceName && deviceName.toLowerCase() === fallbackName.toLowerCase()) return true;
      return false;
    });
    if (!match) {
      projectDeviceStatus.value = "unknown";
      projectDeviceHost.value = "";
      projectDeviceName.value = "";
      return;
    }
    projectDeviceStatus.value = String(match.status || "").toLowerCase() || "unknown";
    projectDeviceHost.value = String(match.host || "").trim();
    projectDeviceName.value = String(match.name || fallbackName).trim();
  } catch {
    projectDeviceStatus.value = "unknown";
  }
};

const startDeviceStatusPolling = () => {
  if (projectDevicePollId) return;
  projectDevicePollId = setInterval(() => {
    if (compileIsActive.value) return;
    refreshCurrentDeviceStatus({ refresh: true });
  }, 10000);
};

const stopDeviceStatusPolling = () => {
  if (!projectDevicePollId) return;
  clearInterval(projectDevicePollId);
  projectDevicePollId = null;
};

const canCompileSavedProject = computed(() => {
  const currentName = String(projectFilename.value || "").trim();
  const currentYaml = String(yamlPreview.value || "");
  if (!currentName || !currentYaml) return false;
  if (!lastSavedYamlName.value || !lastSavedYamlBody.value) return false;
  return currentName === lastSavedYamlName.value && currentYaml === lastSavedYamlBody.value;
});

const canInstallProject = computed(() => {
  const currentName = String(projectFilename.value || "").trim();
  const currentYaml = String(yamlPreview.value || "").trim();
  return Boolean(currentName && currentYaml);
});

const canLogsForCurrentDevice = computed(
  () => canCompileSavedProject.value && projectDeviceStatus.value === "online"
);

const compileIsActive = computed(() => ["queued", "running"].includes(compileJobState.value));
const canCancelCompile = computed(() => Boolean(compileJobId.value) && compileIsActive.value);
const canDownloadCompiledBinary = computed(
  () =>
    compileModalOpen.value &&
    installPlanMode.value === "download" &&
    installPlanDownloadReady.value &&
    compileJobState.value === "success"
);
const canCloseCompile = computed(
  () =>
    Boolean(compileModalOpen.value) &&
    !localFlashRunning.value &&
    ["success", "failed", "canceled"].includes(compileJobState.value)
);
const terminalTitle = computed(() => {
  if (compileActiveAction.value === "flash") return "Flash Console";
  if (compileActiveAction.value === "ota") return "OTA Console";
  if (compileActiveAction.value === "logs") return "Logs Console";
  return "Compile Console";
});
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

const emitCompileState = () => {
  window.dispatchEvent(
    new CustomEvent("app:builder-compile-state", {
      detail: {
        canCompile: canCompileSavedProject.value,
        canInstall: canInstallProject.value,
        canLogs: canLogsForCurrentDevice.value,
        running: compileIsActive.value || localFlashRunning.value
      }
    })
  );
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const compileLineClass = (line) => {
  const classes = ["compile-line"];
  const normalized = String(line || "");
  const levelMatch = normalized.match(/^\[[0-9:.]+\]\[([A-Z])\]/);
  if (levelMatch) {
    const level = levelMatch[1];
    if (level === "E") return classes.concat("line-error");
    if (level === "W") return classes.concat("line-warn");
    if (level === "I") return classes.concat("line-info");
    if (level === "D") return classes.concat("line-debug");
    if (level === "C") return classes.concat("line-success");
  }
  if (/^\s*(error|failed|exception)\b/i.test(normalized)) return classes.concat("line-error");
  if (/^\s*(warn|warning)\b/i.test(normalized)) return classes.concat("line-warn");
  if (/^\s*(success|ok)\b/i.test(normalized)) return classes.concat("line-success");
  if (/^\s*info\b/i.test(normalized)) return classes.concat("line-info");
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
  if (compileStreamSource) {
    compileStreamSource.close();
    compileStreamSource = null;
  }
  compileIsReconnecting.value = false;
};

const stopCompileLongPoll = () => {
  compileLongPollActive = false;
};

const resetInstallPlan = () => {
  installPlanMode.value = "";
  installPlanOtaHost.value = "";
  installPlanSerialPort.value = null;
  installPlanDownloadReady.value = false;
};

const updateCompileJob = (payload) => {
  const jobPayload = payload?.job && typeof payload.job === "object" ? payload.job : payload;
  if (!jobPayload || typeof jobPayload !== "object") return;
  if (jobPayload.id) compileJobId.value = jobPayload.id;
  if (jobPayload.state) compileJobState.value = jobPayload.state;
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

const fetchCompileLogTailWait = async (jobId) => {
  if (!jobId) return false;
  try {
    const response = await addonFetch(
      `api/jobs/${jobId}/tail-wait?since=${encodeURIComponent(compileTailCheckpoint.value)}&timeout=5&limit=200`
    );
    if (!response.ok) return false;
    const payload = await response.json();
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
  stopCompileLongPoll();
  compileTailCheckpoint.value = 0;
  if (!jobId) return;
  compileLongPollActive = true;
  compileIsReconnecting.value = false;
  const loop = async () => {
    while (compileLongPollActive) {
      const shouldContinue = await fetchCompileLogTailWait(jobId);
      if (!shouldContinue) break;
    }
    compileLongPollActive = false;
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

  compileReconnectAttempts.value = 0;
  compileSseLogSeen.value = false;

  if (preferCompileLongPoll) {
    startCompileLongPoll(jobId);
    return;
  }

  const streamUrl = buildAddonUrl(`api/jobs/${jobId}/stream`);
  compileStreamSource = new EventSource(streamUrl, { withCredentials: true });
  compileIsReconnecting.value = false;

  compileStreamSource.addEventListener("log", (event) => {
    compileSseLogSeen.value = true;
    stopCompileLongPoll();
    appendCompileLogLine(event.data || "");
  });

  compileStreamSource.addEventListener("done", async (event) => {
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
    stopCompileStream();
    if (!compileIsActive.value) return;
    compileReconnectAttempts.value += 1;
    if (compileReconnectAttempts.value >= 2) {
      startCompileLongPoll(jobId);
      return;
    }
    if (compileReconnectAttempts.value > compileMaxReconnectAttempts) {
      compileJobError.value = "Log stream disconnected. Check network/proxy path.";
      return;
    }
    compileIsReconnecting.value = true;
    await fetchCompileJobStatus(jobId);
    if (!compileIsActive.value) {
      compileIsReconnecting.value = false;
      return;
    }
    setTimeout(() => {
      if (compileIsActive.value) {
        startCompileStream(jobId);
      }
    }, 1500);
  };

  compileTailStartTimer = setTimeout(() => {
    if (!compileSseLogSeen.value && compileIsActive.value) {
      startCompileLongPoll(jobId);
    }
  }, 2000);
};

const closeCompileModal = () => {
  if (!canCloseCompile.value) return;
  stopCompileStream();
  stopCompileLongPoll();
  stopCompileStatusPoll();
  compileModalOpen.value = false;
  compileJobId.value = "";
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

const cancelCompile = async () => {
  if (!canCancelCompile.value) return;
  try {
    const response = await addonFetch(`api/jobs/${compileJobId.value}/cancel`, {
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(await parseResponseMessage(response, "Cancel failed"));
    }
    await fetchCompileJobStatus(compileJobId.value);
  } catch (error) {
    compileJobError.value = error instanceof Error ? error.message : "Cancel failed";
  }
};

const startInstallJob = async ({ action, device = "", resetConsole = true, introLine = "" }) => {
  if (!canInstallProject.value || compileIsActive.value || localFlashRunning.value) return;

  compileModalOpen.value = true;
  compileAutoScroll.value = true;
  compileJobId.value = "";
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

  try {
    const response = await addonFetch("api/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        yaml: projectFilename.value,
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
    compileJobState.value = responseJob?.state || payload?.state || "queued";
    compileJobError.value = "";

    if (!compileJobId.value) {
      throw new Error("Missing job id");
    }

    startCompileStatusPoll(compileJobId.value);
    startCompileStream(compileJobId.value);
  } catch (error) {
    compileJobState.value = "failed";
    compileJobError.value = error instanceof Error ? error.message : `${action.toUpperCase()} start failed`;
    appendCompileLogLine(`ERROR ${compileJobError.value}`);
    resetInstallPlan();
  }
};

const startCompile = async () => {
  resetInstallPlan();
  await startInstallJob({
    action: "compile",
    introLine: `INFO Starting compile for ${projectFilename.value}`
  });
};

const prepareSerialInstall = async () => {
  if (!canInstallProject.value || compileIsActive.value || localFlashRunning.value) return;
  if (!serialSupported.value) {
    projectSaveError.value = "Your browser does not support Web Serial.";
    return;
  }
  if (!serialSecure.value) {
    projectSaveError.value = "Web Serial requires HTTPS or localhost.";
    return;
  }
  if (!serialPolicyAllowed.value) {
    projectSaveError.value = "Web Serial is blocked by Permissions-Policy.";
    return;
  }

  let port = null;
  try {
    port = await navigator.serial.requestPort();
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return;
    }
    projectSaveError.value = error instanceof Error ? error.message : "Port selection failed";
    return;
  }

  installModalOpen.value = false;
  installPlanMode.value = "serial";
  installPlanSerialPort.value = port;
  installPlanDownloadReady.value = false;
  await startInstallJob({
    action: "compile",
    introLine: `INFO Selected serial port. Starting compile for ${projectFilename.value}`
  });
};

const runLocalFlashWithSelectedPort = async () => {
  const port = installPlanSerialPort.value;
  if (!port) {
    throw new Error("Serial port is not selected.");
  }

  localFlashRunning.value = true;
  compileJobState.value = "running";
  compileActiveAction.value = "flash";
  compileJobError.value = "";
  let transport = null;
  try {
    appendCompileLogLine("INFO Downloading factory firmware from add-on...");
    const response = await addonFetch(
      `api/firmware?yaml=${encodeURIComponent(projectFilename.value)}&variant=factory`
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

const downloadBinary = async () => {
  projectSaveError.value = "";
  try {
    const response = await addonFetch(
      `api/firmware?yaml=${encodeURIComponent(projectFilename.value)}&variant=factory`
    );
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
    anchor.download = projectFilename.value.replace(/\.yaml$/i, ".bin");
    anchor.click();
    URL.revokeObjectURL(url);
    appendCompileLogLine("INFO Firmware download started.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firmware download failed";
    if (compileModalOpen.value) {
      compileJobError.value = message;
      appendCompileLogLine(`ERROR ${message}`);
    } else {
      projectSaveError.value = message;
    }
  }
};

const handleInstallSerialPort = async () => {
  await prepareSerialInstall();
};

const handleInstallOta = async () => {
  const device = preferredDeviceHost.value;
  if (!device) {
    projectSaveError.value = "No saved device host. Save once after setting a reachable host.";
    return;
  }
  installModalOpen.value = false;
  installPlanMode.value = "ota";
  installPlanOtaHost.value = device.trim();
  installPlanDownloadReady.value = false;
  await startInstallJob({
    action: "compile",
    introLine: `INFO Starting compile before OTA for ${projectFilename.value}`
  });
};

const startLogs = async () => {
  if (!canLogsForCurrentDevice.value) return;
  const device = preferredDeviceHost.value;
  if (!device) {
    projectSaveError.value = "No device host found for logs.";
    return;
  }
  resetInstallPlan();
  await startInstallJob({
    action: "logs",
    device,
    introLine: `INFO Starting logs for ${projectFilename.value}`
  });
};

const handleInstallDownload = async () => {
  installModalOpen.value = false;
  installPlanMode.value = "download";
  installPlanDownloadReady.value = false;
  await startInstallJob({
    action: "compile",
    introLine: `INFO Starting compile before firmware download for ${projectFilename.value}`
  });
};

const handleAppCompile = () => {
  startCompile();
};

const handleAppInstall = () => {
  if (!canInstallProject.value || compileIsActive.value || localFlashRunning.value || isProjectSaving.value) return;
  handleProjectSave(true).then((saved) => {
    if (saved) {
      installModalOpen.value = true;
    }
  });
};

const handleAppLogs = () => {
  startLogs();
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
      appendCompileLogLine("INFO Compile successful. Starting serial flash...");
      await runLocalFlashWithSelectedPort();
      return;
    }
    if (installPlanMode.value === "ota") {
      appendCompileLogLine("INFO Compile successful. Starting OTA...");
      await startInstallJob({
        action: "ota",
        device: installPlanOtaHost.value,
        resetConsole: false,
        introLine: `INFO Starting ota for ${projectFilename.value}`
      });
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
  () => compileJobState.value,
  async (nextState, prevState) => {
    if (nextState === prevState) return;
    if (!["success", "failed", "canceled"].includes(nextState)) return;
    if (compileIsActive.value) return;
    const actionFinished = compileActiveAction.value;
    if (!actionFinished) return;
    await handleTerminalActionFinished(nextState, actionFinished);
  }
);

watch(
  () => [
    canInstallProject.value,
    canCompileSavedProject.value,
    canLogsForCurrentDevice.value,
    compileIsActive.value,
    localFlashRunning.value,
    projectFilename.value,
    yamlPreview.value,
    lastSavedYamlName.value,
    lastSavedYamlBody.value
  ],
  () => {
    emitCompileState();
  },
  { immediate: true }
);

watch(
  () => projectFilename.value,
  (nextName) => {
    const host = hostFromYamlName(nextName);
    config.value.ui = {
      ...(config.value.ui || {}),
      deviceHost: host
    };
    refreshCurrentDeviceStatus();
  },
  { immediate: true }
);

watch(
  () => savedDeviceHost.value,
  (host) => {
    if (!host) return;
    if (!projectDeviceHost.value) {
      projectDeviceHost.value = host;
    }
  },
  { immediate: true }
);

const yamlFilenameToProjectFilename = (yamlFilename) => {
  const normalized = String(yamlFilename || "").trim();
  if (!normalized) return "new_file.json";
  if (normalized.toLowerCase().endsWith(".yaml")) {
    return `${normalized.slice(0, -5)}.json`;
  }
  return `${normalized}.json`;
};

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

const createDefaultProjectsIndex = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  folders: [{ id: ADDON_ROOT_FOLDER_ID, name: ADDON_ROOT_FOLDER_LABEL, parentId: null }],
  projectPlacement: []
});

const normalizeProjectsIndexForSave = (source) => {
  const fallback = createDefaultProjectsIndex();
  if (!source || typeof source !== "object") {
    return fallback;
  }

  const folderMap = new Map();
  if (Array.isArray(source.folders)) {
    source.folders.forEach((folder) => {
      if (!folder || typeof folder !== "object") return;
      const id = typeof folder.id === "string" ? folder.id.trim() : "";
      if (!id || folderMap.has(id)) return;
      const name = typeof folder.name === "string" && folder.name.trim() ? folder.name.trim() : id;
      const parentId =
        folder.parentId === null || folder.parentId === undefined
          ? null
          : String(folder.parentId).trim() || ADDON_ROOT_FOLDER_ID;
      folderMap.set(id, { id, name, parentId });
    });
  }

  if (!folderMap.has(ADDON_ROOT_FOLDER_ID)) {
    folderMap.set(ADDON_ROOT_FOLDER_ID, {
      id: ADDON_ROOT_FOLDER_ID,
      name: ADDON_ROOT_FOLDER_LABEL,
      parentId: null
    });
  } else {
    const root = folderMap.get(ADDON_ROOT_FOLDER_ID);
    folderMap.set(ADDON_ROOT_FOLDER_ID, {
      id: ADDON_ROOT_FOLDER_ID,
      name: root?.name || ADDON_ROOT_FOLDER_LABEL,
      parentId: null
    });
  }

  const validFolderIds = new Set(folderMap.keys());
  const folders = Array.from(folderMap.values()).map((folder) => {
    if (folder.id === ADDON_ROOT_FOLDER_ID) {
      return { ...folder, parentId: null };
    }
    if (!folder.parentId || !validFolderIds.has(folder.parentId) || folder.parentId === folder.id) {
      return { ...folder, parentId: ADDON_ROOT_FOLDER_ID };
    }
    return folder;
  });

  const placementByName = new Map();
  if (Array.isArray(source.projectPlacement)) {
    source.projectPlacement.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name || placementByName.has(name)) return;
      const folderId =
        typeof entry.folderId === "string" && validFolderIds.has(entry.folderId)
          ? entry.folderId
          : ADDON_ROOT_FOLDER_ID;
      placementByName.set(name, { name, folderId });
    });
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders,
    projectPlacement: Array.from(placementByName.values())
  };
};

const upsertProjectInRoot = (indexData, projectJsonName) => {
  const normalized = normalizeProjectsIndexForSave(indexData);
  const placement = Array.isArray(normalized.projectPlacement) ? [...normalized.projectPlacement] : [];
  const existingIndex = placement.findIndex((entry) => entry.name === projectJsonName);
  const rootEntry = { name: projectJsonName, folderId: ADDON_ROOT_FOLDER_ID };
  if (existingIndex >= 0) {
    placement.splice(existingIndex, 1, rootEntry);
  } else {
    placement.push(rootEntry);
  }
  normalized.projectPlacement = placement;
  normalized.updatedAt = new Date().toISOString();
  return normalized;
};

const buildProjectConfigPayload = () => {
  try {
    return JSON.parse(safeStringify(config.value));
  } catch {
    return config.value;
  }
};

const saveCurrentProjectAndYaml = async (silent = false) => {
  const yamlName = projectFilename.value || "config.yaml";
  const projectJsonName = yamlFilenameToProjectFilename(yamlName);
  const hostToPersist = hostFromYamlName(yamlName);
  config.value.ui = {
    ...(config.value.ui || {}),
    ...(hostToPersist ? { deviceHost: hostToPersist } : {})
  };

  const saveYamlResponse = await addonFetch("save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: yamlName,
      yaml: yamlPreview.value
    })
  });
  if (!saveYamlResponse.ok) {
    throw new Error(await parseResponseMessage(saveYamlResponse, "Failed to save YAML"));
  }

  const saveProjectResponse = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: projectJsonName,
      data: buildProjectConfigPayload()
    })
  });
  if (!saveProjectResponse.ok) {
    throw new Error(await parseResponseMessage(saveProjectResponse, "Failed to save project JSON"));
  }

  let projectsIndex = createDefaultProjectsIndex();
  const loadProjectsIndexResponse = await addonFetch("projects/load?name=projects.json");
  if (loadProjectsIndexResponse.ok) {
    try {
      const payload = await loadProjectsIndexResponse.json();
      if (payload?.data && typeof payload.data === "object") {
        projectsIndex = payload.data;
      }
    } catch {
      projectsIndex = createDefaultProjectsIndex();
    }
  } else if (loadProjectsIndexResponse.status !== 404) {
    throw new Error(await parseResponseMessage(loadProjectsIndexResponse, "Failed to load projects index"));
  }

  const nextProjectsIndex = upsertProjectInRoot(projectsIndex, projectJsonName);
  const saveProjectsIndexResponse = await addonFetch("projects/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "projects.json",
      data: nextProjectsIndex
    })
  });
  if (!saveProjectsIndexResponse.ok) {
    throw new Error(await parseResponseMessage(saveProjectsIndexResponse, "Failed to update projects.json"));
  }

  lastSavedYamlName.value = yamlName;
  lastSavedYamlBody.value = yamlPreview.value;
  await registerCurrentDevice(yamlName);
  await refreshCurrentDeviceStatus();
  emitProjectsUpdated();
  if (!silent) {
    projectSaveMessage.value = `Saved ${yamlName} and ${projectJsonName}.`;
  }
  return true;
};

const handleProjectSave = async (silent = false) => {
  if (isProjectSaving.value) return false;

  isProjectSaving.value = true;
  projectSaveError.value = "";
  if (!silent) {
    projectSaveMessage.value = "";
  }
  projectMenuOpen.value = false;

  try {
    await saveCurrentProjectAndYaml(silent);
    return true;
  } catch (error) {
    projectSaveError.value = error instanceof Error ? error.message : "Unknown save error";
    return false;
  } finally {
    isProjectSaving.value = false;
  }
};

const normalizeComponentEntry = (entry) => {
  if (typeof entry === "string" && entry) {
    return { id: entry, config: {} };
  }

  if (entry && typeof entry === "object") {
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!id) return null;
    const config = entry.config && typeof entry.config === "object" ? entry.config : {};
    const customConfig = typeof entry.customConfig === "string" ? entry.customConfig : "";
    return { id, config, customConfig };
  }

  return null;
};

const normalizeConfig = (raw) => {
  const fallback = defaultConfig();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const { logger: legacyLogger, otherCore: legacyOtherCore, ...rawWithoutLegacy } = raw;

  const merged = {
    ...fallback,
    ...rawWithoutLegacy,
    device: {
      ...fallback.device,
      ...(raw.device ?? {})
    },
    components: Array.isArray(raw.components)
      ? raw.components.map(normalizeComponentEntry).filter(Boolean)
      : fallback.components,
    protocolsCore: {
      ...fallback.protocolsCore,
      ...(raw.protocolsCore ?? {})
    },
    bussesCore: {
      ...fallback.bussesCore,
      ...(raw.bussesCore ?? {})
    },
    system: {
      ...fallback.system,
      ...(raw.system ?? {})
    },
    ui: {
      ...fallback.ui,
      ...(raw.ui ?? {})
    }
  };

  if (!merged.system?.logger || Object.keys(merged.system.logger || {}).length === 0) {
    if (legacyLogger && Object.keys(legacyLogger).length) {
      merged.system = {
        ...merged.system,
        logger: {
          enabled: true,
          ...legacyLogger
        }
      };
    }
  }

  return merged;
};

const loadConfig = () => {
  const stored = localStorage.getItem("vebBuilderDeviceConfig");
  if (!stored) {
    const storedPreview = localStorage.getItem("vebBuilderSplitPreview");
    if (storedPreview !== null) {
      splitPreviewEnabled.value = storedPreview === "1";
      if (!config.value.ui || typeof config.value.ui !== "object") {
        config.value.ui = {};
      }
      config.value.ui.splitPreview = splitPreviewEnabled.value;
    }
    activeModeLevel.value = resolveModeLevel(config.value.ui?.modeLevel);
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = activeModeLevel.value;
    isHydrating.value = false;
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    if (parsed?.schemaVersion === 1) {
      config.value = normalizeConfig(parsed);
      try {
        localStorage.setItem("vebBuilderDeviceConfig", safeStringify(config.value));
      } catch (error) {
        console.error("Failed to clean stored config", error);
      }
    }
    const storedPreview = localStorage.getItem("vebBuilderSplitPreview");
    if (storedPreview !== null) {
      splitPreviewEnabled.value = storedPreview === "1";
      if (!config.value.ui || typeof config.value.ui !== "object") {
        config.value.ui = {};
      }
      config.value.ui.splitPreview = splitPreviewEnabled.value;
    } else {
      splitPreviewEnabled.value = Boolean(config.value.ui?.splitPreview);
    }
    activeModeLevel.value = resolveModeLevel(config.value.ui?.modeLevel);
    if (!config.value.ui || typeof config.value.ui !== "object") {
      config.value.ui = {};
    }
    config.value.ui.modeLevel = activeModeLevel.value;
    isHydrating.value = false;
  } catch (error) {
    isHydrating.value = false;
    // ignore invalid stored data
  }
};

const updateComponentField = (componentIndex, path, value) => {
  const entry = config.value.components[componentIndex];
  if (!entry) return;
  if (!entry.config || typeof entry.config !== "object") {
    entry.config = {};
  }

  let target = entry.config;
  const lastKey = path[path.length - 1];
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  });

  target[lastKey] = value;
};

const updateRootField = (targetRoot, path, value) => {
  if (!targetRoot || typeof targetRoot !== "object") return;
  let target = targetRoot;
  const lastKey = path[path.length - 1];
  path.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  });
  target[lastKey] = value;
};

const handleSchemaUpdate = ({ path, value }) => {
  if (activeComponentSlot.value === null) return;
  updateComponentField(activeComponentSlot.value, path, value);
  if (path[path.length - 1] === "bus") {
    const entry = config.value.components[activeComponentSlot.value];
    if (!entry?.config) return;
    if (value === "i2c") {
      delete entry.config.cs_pin;
    }
    if (value === "spi") {
      delete entry.config.address;
    }
  }
  saveConfig();
};

const handleCoreSchemaUpdate = ({ path, value }) => {
  if (!config.value.esphomeCore || typeof config.value.esphomeCore !== "object") {
    config.value.esphomeCore = {};
  }
  updateRootField(config.value.esphomeCore, path, value);
  saveConfig();
};

const handleSubstitutionsSchemaUpdate = ({ path, value }) => {
  if (!config.value.substitutions || typeof config.value.substitutions !== "object") {
    config.value.substitutions = {};
  }
  updateRootField(config.value.substitutions, path, value);
  saveConfig();
};

const handlePlatformSchemaUpdate = ({ path, value }) => {
  if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
    config.value.platformCore = {};
  }
  updateRootField(config.value.platformCore, path, value);
  saveConfig();
};

const handleNetworkSchemaUpdate = ({ path, value }) => {
  if (!config.value.networkCore || typeof config.value.networkCore !== "object") {
    config.value.networkCore = {};
  }
  updateRootField(config.value.networkCore, path, value);
  saveConfig();
};

const handleBussesDetailUpdate = ({ path, value }) => {
  const key = activeBussesKey.value;
  if (!key) return;
  if (!config.value.bussesCore || typeof config.value.bussesCore !== "object") {
    config.value.bussesCore = {};
  }
  if (!config.value.bussesCore[key] || typeof config.value.bussesCore[key] !== "object") {
    config.value.bussesCore[key] = {};
  }
  updateRootField(config.value.bussesCore[key], path, value);
  saveConfig();
};

const handleProtocolDetailUpdate = ({ path, value }) => {
  const key = activeProtocolKey.value;
  if (!key) return;
  if (!config.value.protocolsCore || typeof config.value.protocolsCore !== "object") {
    config.value.protocolsCore = {};
  }
  if (!config.value.protocolsCore[key] || typeof config.value.protocolsCore[key] !== "object") {
    config.value.protocolsCore[key] = {};
  }
  updateRootField(config.value.protocolsCore[key], path, value);
  saveConfig();
};

const handleOtherDetailUpdate = ({ path, value }) => {
  const key = activeOtherKey.value;
  if (!key) return;
  if (!config.value.system || typeof config.value.system !== "object") {
    config.value.system = {};
  }
  if (!config.value.system[key] || typeof config.value.system[key] !== "object") {
    config.value.system[key] = {};
  }
  updateRootField(config.value.system[key], path, value);
  saveConfig();
};

const handleAutomationDetailUpdate = ({ path, value }) => {
  if (!activeAutomationKey.value) return;
  if (!config.value.automation || typeof config.value.automation !== "object") {
    config.value.automation = {};
  }
  updateRootField(config.value.automation, path, value);
  saveConfig();
};

const handleCustomConfigUpdate = (value) => {
  if (activeComponentSlot.value === null) return;
  const entry = config.value.components[activeComponentSlot.value];
  if (!entry) return;
  entry.customConfig = value;
  saveConfig();
};


watch(
  () => config.value.platformCore?.variant,
  (variant) => {
    if (!variant) return;
    if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
      config.value.platformCore = {};
    }
    config.value.platformCore.framework = "esp-idf";
  }
);

watch(
  () => config.value,
  () => {
    saveConfig();
  },
  { deep: true }
);

watch(
  () => activeTab.value,
  (value) => {
    if (value !== "Automation") return;
    if (!automationDefinitions.length) return;
    if (!activeAutomationKey.value) {
      activeAutomationKey.value = automationDefinitions[0].key;
    }
  }
);

onMounted(async () => {
  loadConfig();
  window.addEventListener("resize", updatePreviewTabLayout);
  window.addEventListener("click", handleProjectMenuOutside);
  updatePreviewTabLayout();
  try {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const response = await fetch(`${normalizedBaseUrl}components_list/components_list.json`);
    if (!response.ok) {
      throw new Error(`Component catalog load failed (${response.status})`);
    }
    componentCatalog.value = await response.json();
    componentCatalogError.value = null;
  } catch (error) {
    componentCatalogError.value = error;
    componentCatalog.value = { categories: [] };
    console.error("Component catalog load failed", error);
  } finally {
    isComponentCatalogLoading.value = false;
  }
  try {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const response = await fetch(
      `${normalizedBaseUrl}runtime/esp_assets/mdi_glyph_substitutions.yaml`
    );
    if (response.ok) {
      const text = await response.text();
      const map = {};
      text.split(/\r?\n/).forEach((line) => {
        if (!line.startsWith("  ")) return;
        const match = line.match(/^\s{2}([^:]+):\s+\"([^\"]+)\"/);
        if (!match) return;
        map[match[1]] = match[2];
      });
      mdiSubstitutions.value = map;
    }
  } catch (error) {
    console.error("MDI substitutions load failed", error);
  }
  try {
    const response = await fetch("https://cdn.jsdelivr.net/npm/@mdi/svg/meta.json");
    if (!response.ok) {
      throw new Error(`MDI icon list load failed (${response.status})`);
    }
    const data = await response.json();
    mdiIcons.value = Array.isArray(data)
      ? data.filter((icon) => !icon.deprecated).map((icon) => icon.name)
      : [];
  } catch (error) {
    console.error("MDI icon list load failed", error);
    mdiIcons.value = [];
  }
  try {
    let loaded = false;
    try {
      const apiResponse = await addonFetch("api/assets/refresh?kind=images", {
        method: "POST"
      });
      if (apiResponse.ok) {
        const apiPayload = await apiResponse.json();
        const imagesFromApi = apiPayload?.images?.images;
        if (Array.isArray(imagesFromApi)) {
          displayImages.value = imagesFromApi;
          loaded = true;
        }
      }
    } catch {
      // fallback to static runtime file below
    }

    if (!loaded) {
      const baseUrl = import.meta.env.BASE_URL || "/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const response = await fetch(`${normalizedBaseUrl}runtime/esp_assets/images.json`);
      if (!response.ok) {
        throw new Error(`Display images load failed (${response.status})`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new Error("Display images source is not JSON");
      }
      const payload = await response.json();
      displayImages.value = Array.isArray(payload?.images) ? payload.images : [];
    }
  } catch (error) {
    console.error("Display images load failed", error);
    displayImages.value = [];
  }
  try {
    gpioData.value = await loadGpioData();
  } catch (error) {
    console.error(error);
  }
  try {
    esphomeCoreSchema.value = await loadSchemaByPath("general/core/core.json");
  } catch (error) {
    console.error("ESPHome core schema load failed", error);
  }
  try {
    substitutionsCoreSchema.value = await loadSchemaByPath("general/core/substitutions.json");
  } catch (error) {
    console.error("Substitutions schema load failed", error);
  }
  try {
    platformCoreSchema.value = await loadSchemaByPath("general/platform/platform.json");
  } catch (error) {
    console.error("Platform core schema load failed", error);
  }
  try {
    const protocolsSchemasLoaded = {};
    await Promise.all(
      protocolDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`${entry.schemaId}.json`);
        protocolsSchemasLoaded[entry.key] = schema;
      })
    );
    protocolsSchemas.value = protocolsSchemasLoaded;
  } catch (error) {
    console.error("Protocols schemas load failed", error);
  }
  try {
    const otherSchemasLoaded = {};
    await Promise.all(
      otherDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/system/${entry.key}.json`);
        otherSchemasLoaded[entry.key] = schema;
      })
    );
    otherSchemas.value = otherSchemasLoaded;
  } catch (error) {
    console.error("System schemas load failed", error);
  }
  try {
    const automationSchemasLoaded = {};
    await Promise.all(
      automationDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/automation/${entry.key}.json`);
        automationSchemasLoaded[entry.key] = schema;
      })
    );
    automationSchemas.value = automationSchemasLoaded;
  } catch (error) {
    console.error("Automation schemas load failed", error);
  }
  try {
    const bussesSchemasLoaded = {};
    await Promise.all(
      bussesDefinitions.map(async (entry) => {
        const schema = await loadSchemaByPath(`general/busses/${entry.key}.json`);
        bussesSchemasLoaded[entry.key] = schema;
      })
    );
    bussesSchemas.value = bussesSchemasLoaded;
  } catch (error) {
    console.error("Busses schemas load failed", error);
  }
  try {
    networkCoreSchema.value = await loadSchemaByPath("general/network/network.json");
  } catch (error) {
    console.error("Network core schema load failed", error);
  }
  const platform = platformCoreConfig.value?.platform;
  if (platform) {
    try {
      platformDetailSchema.value = await loadSchemaByPath(`general/platform/${platform}.json`);
    } catch (error) {
      console.error("Platform schema load failed", error);
    }
  }
  const transport = networkCoreConfig.value?.transport;
  if (transport) {
    try {
      networkDetailSchema.value = await loadSchemaByPath(`general/network/${transport}.json`);
    } catch (error) {
      console.error("Network schema load failed", error);
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updatePreviewTabLayout);
  window.removeEventListener("click", handleProjectMenuOutside);
});

watch(
  () => platformCoreConfig.value?.platform,
  async (platform, previous) => {
    if (!platform) {
      platformDetailSchema.value = null;
      return;
    }
    if (previous && previous !== platform) {
      if (platform === "esp8266") {
        config.value.platformCore = { platform, board: "esp01_1m" };
      } else if (platform === "esp32") {
        config.value.platformCore = {
          platform,
          variant: "esp32",
          framework: "esp-idf"
        };
      } else if (platform === "rp2040") {
        config.value.platformCore = { platform, board: "rpipicow" };
      } else if (platform === "bk72xx") {
        config.value.platformCore = {
          platform,
          board: "generic-bk7231n-qfn32-tuya"
        };
      } else if (platform === "rtl87xx") {
        config.value.platformCore = {
          platform,
          board: "generic-rtl8710bn-2mb-788k"
        };
      } else if (platform === "ln882x") {
        config.value.platformCore = { platform, board: "generic-ln882hki" };
      } else if (platform === "nrf52") {
        config.value.platformCore = {
          platform,
          board: "adafruit_feather_nrf52840",
          dcdc: true
        };
      } else if (platform === "host") {
        config.value.platformCore = { platform, mac_address: "06:35:69:ab:f6:79" };
      } else {
        config.value.platformCore = { platform };
      }
    }
    try {
      platformDetailSchema.value = await loadSchemaByPath(`general/platform/${platform}.json`);
    } catch (error) {
      console.error("Platform schema load failed", error);
      platformDetailSchema.value = null;
    }
    if (platformDetailSchema.value?.fields?.length) {
      const allowedKeys = new Set([
        "platform",
        ...platformDetailSchema.value.fields.map((field) => field.key)
      ]);
      if (platform === "esp32") {
        allowedKeys.add("framework");
        allowedKeys.add("framework_config");
        allowedKeys.add("advanced");
        allowedKeys.add("components");
      }
      Object.keys(config.value.platformCore || {}).forEach((key) => {
        if (!allowedKeys.has(key)) {
          delete config.value.platformCore[key];
        }
      });
    }
    if (platform === "esp8266") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "esp01_1m" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "esp01_1m";
      }
    }
    if (platform === "esp32") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          variant: "esp32",
          framework: "esp-idf"
        };
      }
      if (!config.value.platformCore.variant) {
        config.value.platformCore.variant = "esp32";
      }
      if (!config.value.platformCore.framework) {
        config.value.platformCore.framework = "esp-idf";
      }
      if (previous === "esp8266" && config.value.platformCore.board === "esp01_1m") {
        delete config.value.platformCore.board;
      }
    }
    if (platform === "rp2040") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "rpipicow" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "rpipicow";
      }
    }
    if (platform === "bk72xx") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "generic-bk7231n-qfn32-tuya"
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-bk7231n-qfn32-tuya";
      }
    }
    if (platform === "rtl87xx") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "generic-rtl8710bn-2mb-788k"
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-rtl8710bn-2mb-788k";
      }
    }
    if (platform === "ln882x") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, board: "generic-ln882hki" };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "generic-ln882hki";
      }
    }
    if (platform === "nrf52") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = {
          platform,
          board: "adafruit_feather_nrf52840",
          dcdc: true
        };
      }
      if (!config.value.platformCore.board) {
        config.value.platformCore.board = "adafruit_feather_nrf52840";
      }
      if (config.value.platformCore.dcdc === undefined) {
        config.value.platformCore.dcdc = true;
      }
    }
    if (platform === "host") {
      if (!config.value.platformCore || typeof config.value.platformCore !== "object") {
        config.value.platformCore = { platform, mac_address: "06:35:69:ab:f6:79" };
      }
      if (!config.value.platformCore.mac_address) {
        config.value.platformCore.mac_address = "06:35:69:ab:f6:79";
      }
    }
  }
);

watch(
  () => networkCoreConfig.value?.transport,
  async (transport, previous) => {
    if (!transport) {
      networkDetailSchema.value = null;
      return;
    }
    try {
      networkDetailSchema.value = await loadSchemaByPath(`general/network/${transport}.json`);
    } catch (error) {
      networkDetailSchema.value = null;
      console.error("Network schema load failed", error);
    }
  }
);

watch(
  () => networkCoreConfig.value?.ap?.enabled,
  (enabled) => {
    if (enabled === false) {
      config.value.networkCore.ap = { enabled: false };
    }
  }
);

watch(
  () => networkCoreConfig.value?.web_server?.enabled,
  (enabled) => {
    if (enabled === false) {
      config.value.networkCore.web_server = { enabled: false };
    }
  }
);

watch(
  () => networkCoreConfig.value?.ota?.enabled,
  (enabled) => {
    if (enabled === false) {
      const otaConfig = config.value.networkCore?.ota || {};
      otaConfig.use_password = false;
      config.value.networkCore.ota = otaConfig;
    }
  }
);

watch(
  () => [networkCoreConfig.value?.transport, networkCoreConfig.value?.type],
  ([transport, type], [previousTransport, previousType]) => {
    if (transport !== "ethernet") return;
    if (!type || type === previousType) return;
    const spiTypes = new Set(["W5500", "DM9051"]);
    const isSpiType = spiTypes.has(type);
    const networkCore = config.value.networkCore;
    if (!networkCore || typeof networkCore !== "object") return;

    const clearIfPresent = (key) => {
      if (networkCore[key] !== undefined) {
        delete networkCore[key];
      }
    };

    if (isSpiType) {
      clearIfPresent("mdc_pin");
      clearIfPresent("mdio_pin");
      clearIfPresent("power_pin");
      if (networkCore.clk && typeof networkCore.clk === "object") {
        delete networkCore.clk.pin;
        if (!Object.keys(networkCore.clk).length) {
          delete networkCore.clk;
        }
      }
      return;
    }

    clearIfPresent("cs_pin");
    clearIfPresent("interrupt_pin");
    clearIfPresent("reset_pin");

    if (!requiredBusses.value.has("spi")) {
      if (config.value.bussesCore && typeof config.value.bussesCore === "object") {
        if (config.value.bussesCore.spi && typeof config.value.bussesCore.spi === "object") {
          config.value.bussesCore.spi = {};
        }
      }
    }
  }
);

watch(
  () => activeTab.value,
  (value) => {
    if (value === "Protocols" && !activeProtocolKey.value) {
      activeProtocolKey.value = protocolDefinitions[0]?.key || "";
    }
    if (value === "Busses" && !activeBussesKey.value) {
      activeBussesKey.value = bussesDefinitions[0]?.key || "";
    }
    if (value !== "System") return;
    if (!activeOtherKey.value) {
      activeOtherKey.value = otherDefinitions[0]?.key || "";
    }
  }
);

watch(
  () => requiredBussesList.value,
  (requiredList) => {
    if (!areComponentSchemasReady.value) return;
    if (!config.value.bussesCore || typeof config.value.bussesCore !== "object") {
      config.value.bussesCore = {};
    }
    const requiredSet = new Set(requiredList || []);
    bussesDefinitions.forEach((entry) => {
      const shouldEnable = requiredSet.has(entry.key);
      if (!config.value.bussesCore[entry.key] || typeof config.value.bussesCore[entry.key] !== "object") {
        config.value.bussesCore[entry.key] = {};
      }
      const busConfig = config.value.bussesCore[entry.key];
      if (shouldEnable && busConfig.enabled !== true) {
        busConfig.enabled = true;
        return;
      }
      if (!shouldEnable && busConfig.enabled !== false) {
        busConfig.enabled = false;
      }
    });
  },
  { immediate: true }
);

watch(
  () => componentIdList.value,
  (next, prev) => {
    const prevSet = new Set(prev || []);
    (next || []).forEach((componentId) => {
      if (!componentId || prevSet.has(componentId)) return;
      ensureComponentSchema(componentId);
      const schema = componentSchemas.value?.[componentId];
      if (schema === undefined) {
        pendingBusPulseIds.add(componentId);
        return;
      }
      triggerPulseIfComponentNeedsBus(componentId);
    });
  }
);

watch(
  () => componentSchemas.value,
  () => {
    if (!pendingBusPulseIds.size) return;
    Array.from(pendingBusPulseIds).forEach((componentId) => {
      const schema = componentSchemas.value?.[componentId];
      if (schema === undefined) return;
      pendingBusPulseIds.delete(componentId);
      if (!schema) return;
      triggerPulseIfComponentNeedsBus(componentId);
    });
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (busTabPulseTimer) {
    clearTimeout(busTabPulseTimer);
  }
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
  }
  window.removeEventListener("resize", updatePreviewScrollbar);
  window.removeEventListener("app:builder-export", handleAppExport);
  window.removeEventListener("app:builder-compile", handleAppCompile);
  window.removeEventListener("app:builder-install", handleAppInstall);
  window.removeEventListener("app:builder-logs", handleAppLogs);
  stopCompileStream();
  stopCompileLongPoll();
  stopCompileStatusPoll();
  stopDeviceStatusPolling();
  closeProjectsUpdatedChannel();
  clearCompileLogQueue();
  window.dispatchEvent(
    new CustomEvent("app:builder-compile-state", {
      detail: { canCompile: false, canInstall: false, canLogs: false, running: false }
    })
  );
});
</script>
