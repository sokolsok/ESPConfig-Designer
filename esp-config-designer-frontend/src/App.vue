<template>
  <div class="app-shell">
    <UnsavedChangesModal
      :open="leaveModalOpen"
      :busy="leaveModalBusy"
      :error-message="leaveModalError"
      title="Unsaved project"
      message="Current Builder project has unsaved changes. Save before opening Dashboard?"
      save-text="Save"
      discard-text="Discard"
      cancel-text="Cancel"
      @save="handleLeaveModalSave"
      @discard="handleLeaveModalDiscard"
      @cancel="handleLeaveModalCancel"
    />

    <header class="builder-hero app-topbar">
      <div class="app-topbar-left">
        <div class="builder-hero-brand">
        <img src="/ECD_logo.png" alt="ECD" />
        <span class="builder-hero-meta">v 1.0.12</span>
        </div>
      </div>

      <div class="app-topbar-actions">
        <button
          v-if="isDashboardRoute"
          class="btn-standard action-edit"
          :disabled="!topbarCanEdit || topbarBusy"
          @click="triggerDashboardEdit"
        >
          Edit
        </button>
        <button
          v-if="isBuilderRoute"
          class="btn-standard action-save"
          :disabled="!canTopbarSave"
          @click="triggerBuilderSave"
        >
          Save
        </button>
        <div v-if="showActionButtons" ref="installMenuRef" class="topbar-install-menu">
          <button
            class="btn-standard action-install"
            :disabled="!topbarCanInstall || topbarBusy"
            @click="toggleInstallMenu"
          >
            Install
          </button>
          <div v-if="installMenuOpen" class="topbar-install-dropdown" role="menu" aria-label="Install options">
            <button type="button" role="menuitem" @click="selectInstallOption('serial')">Via Serial Port</button>
            <button
              type="button"
              role="menuitem"
              :disabled="!topbarCanUseOta"
              @click="selectInstallOption('ota')"
            >
              Wireless (OTA)
            </button>
            <button type="button" role="menuitem" @click="selectInstallOption('download')">Download Binary</button>
          </div>
        </div>
        <button
          v-if="showActionButtons"
          class="btn-standard action-logs"
          :disabled="!topbarCanLogs || topbarBusy"
          @click="triggerBuilderLogs"
        >
          Logs
        </button>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import UnsavedChangesModal from "./components/UnsavedChangesModal.vue";

const route = useRoute();
const router = useRouter();
const isBuilderRoute = computed(() => route.name === "builder");
const isDashboardRoute = computed(() => route.name === "dashboard");
const showActionButtons = computed(() => isBuilderRoute.value || isDashboardRoute.value);
const builderCanInstall = ref(false);
const builderCanUseOta = ref(false);
const builderCanLogs = ref(false);
const builderBusy = ref(false);
const dashboardCanInstall = ref(false);
const dashboardCanUseOta = ref(false);
const dashboardCanLogs = ref(false);
const dashboardCanEdit = ref(false);
const dashboardBusy = ref(false);
const builderHasUnsavedChanges = ref(false);
const builderSaveRunning = ref(false);
const installMenuOpen = ref(false);
const installMenuRef = ref(null);
const leaveModalOpen = ref(false);
const leaveModalBusy = ref(false);
const leaveModalError = ref("");
const pendingSwitchRouteName = ref("");

const topbarCanInstall = computed(() =>
  isBuilderRoute.value ? builderCanInstall.value : dashboardCanInstall.value
);
const topbarCanUseOta = computed(() =>
  isBuilderRoute.value ? builderCanUseOta.value : dashboardCanUseOta.value
);
const topbarCanLogs = computed(() =>
  isBuilderRoute.value ? builderCanLogs.value : dashboardCanLogs.value
);
const topbarCanEdit = computed(() => dashboardCanEdit.value);
const topbarBusy = computed(() => (isBuilderRoute.value ? builderBusy.value : dashboardBusy.value));
const canTopbarSave = computed(
  () => isBuilderRoute.value && builderHasUnsavedChanges.value && !topbarBusy.value && !builderSaveRunning.value
);

const handleCompileState = (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  builderCanInstall.value = detail.canInstall === true;
  builderCanUseOta.value = detail.canUseOta === true;
  builderCanLogs.value = detail.canLogs === true;
  builderBusy.value = detail.running === true;
  builderHasUnsavedChanges.value = detail.hasUnsavedChanges === true;
};

const handleDashboardActionsState = (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  dashboardCanInstall.value = detail.canInstall === true;
  dashboardCanUseOta.value = detail.canUseOta === true;
  dashboardCanLogs.value = detail.canLogs === true;
  dashboardCanEdit.value = detail.canEdit === true;
  dashboardBusy.value = detail.running === true;
};

onMounted(() => {
  window.addEventListener("app:builder-compile-state", handleCompileState);
  window.addEventListener("app:dashboard-actions-state", handleDashboardActionsState);
  window.addEventListener("app:route-switch-request", handleRouteSwitchRequest);
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("app:builder-compile-state", handleCompileState);
  window.removeEventListener("app:dashboard-actions-state", handleDashboardActionsState);
  window.removeEventListener("app:route-switch-request", handleRouteSwitchRequest);
  window.removeEventListener("click", handleGlobalClick);
  window.removeEventListener("keydown", handleGlobalKeydown);
});

const closeInstallMenu = () => {
  installMenuOpen.value = false;
};

const toggleInstallMenu = () => {
  if (!topbarCanInstall.value || topbarBusy.value) return;
  installMenuOpen.value = !installMenuOpen.value;
};

const selectInstallOption = (mode) => {
  closeInstallMenu();
  window.dispatchEvent(new CustomEvent("app:install-option", { detail: { mode } }));
};

const triggerBuilderLogs = () => {
  window.dispatchEvent(new CustomEvent("app:builder-logs"));
};

const triggerDashboardEdit = () => {
  window.dispatchEvent(new CustomEvent("app:dashboard-edit"));
};

const handleGlobalClick = (event) => {
  if (!installMenuOpen.value) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (installMenuRef.value instanceof Element && installMenuRef.value.contains(target)) return;
  closeInstallMenu();
};

const handleGlobalKeydown = (event) => {
  if (event.key !== "Escape") return;
  closeInstallMenu();
};

const triggerBuilderSave = async () => {
  if (!canTopbarSave.value) return;
  builderSaveRunning.value = true;
  try {
    const result = await requestBuilderSave();
    if (!result.success) {
      console.error(result.message || "Project save failed.");
    }
  } finally {
    builderSaveRunning.value = false;
  }
};

const handleRouteSwitchRequest = (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  const routeName = typeof detail.routeName === "string" ? detail.routeName : "";
  if (!routeName) return;
  requestRouteChange(routeName);
};

const navigateToPendingRoute = async () => {
  const routeName = pendingSwitchRouteName.value;
  if (!routeName) return;
  pendingSwitchRouteName.value = "";
  await router.push({ name: routeName });
};

const requestBuilderSave = () => {
  const requestId = `builder-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("app:builder-save-response", onResponse);
      resolve({ success: false, message: "Builder save request timed out." });
    }, 30000);

    const onResponse = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      if (detail.requestId !== requestId) return;
      window.clearTimeout(timeoutId);
      window.removeEventListener("app:builder-save-response", onResponse);
      resolve({
        success: detail.success === true,
        message: typeof detail.message === "string" ? detail.message : ""
      });
    };

    window.addEventListener("app:builder-save-response", onResponse);
    window.dispatchEvent(new CustomEvent("app:builder-save-request", { detail: { requestId } }));
  });
};

const handleLeaveModalCancel = () => {
  leaveModalOpen.value = false;
  leaveModalBusy.value = false;
  leaveModalError.value = "";
  pendingSwitchRouteName.value = "";
};

const handleLeaveModalDiscard = async () => {
  leaveModalOpen.value = false;
  leaveModalBusy.value = false;
  leaveModalError.value = "";
  await navigateToPendingRoute();
};

const handleLeaveModalSave = async () => {
  leaveModalBusy.value = true;
  leaveModalError.value = "";
  const result = await requestBuilderSave();
  if (!result.success) {
    leaveModalBusy.value = false;
    leaveModalError.value = result.message || "Project save failed.";
    return;
  }
  leaveModalOpen.value = false;
  leaveModalBusy.value = false;
  leaveModalError.value = "";
  await navigateToPendingRoute();
};

const requestRouteChange = async (routeName) => {
  closeInstallMenu();
  const targetRouteName = typeof routeName === "string" && routeName ? routeName : "";
  if (!targetRouteName) return;
  if (route.name === targetRouteName) return;
  if (isBuilderRoute.value && targetRouteName === "dashboard" && builderHasUnsavedChanges.value) {
    pendingSwitchRouteName.value = targetRouteName;
    leaveModalError.value = "";
    leaveModalBusy.value = false;
    leaveModalOpen.value = true;
    return;
  }
  await router.push({ name: targetRouteName });
};

watch(
  () => route.name,
  () => {
    closeInstallMenu();
  }
);
</script>

<style scoped>
.app-shell {
  gap: 0;
}

.app-topbar {
  position: relative;
  padding-top: 14px;
  padding-bottom: 13px;
}

.app-topbar-left {
  display: inline-flex;
  align-items: center;
}

.app-topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.topbar-install-menu {
  position: relative;
}

.topbar-install-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 168px;
  display: grid;
  gap: 4px;
  padding: 6px;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  background: #ffffff;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
  z-index: 90;
}

.topbar-install-dropdown button {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 10px;
}

.topbar-install-dropdown button:hover:not(:disabled) {
  background: #eef3fd;
}

.topbar-install-dropdown button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-main {
  gap: 0;
  min-height: 0;
}
</style>
