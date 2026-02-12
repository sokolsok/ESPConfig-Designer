<template>
  <div class="app-shell">
    <header class="builder-hero app-topbar">
      <div class="app-topbar-left">
        <div class="builder-hero-brand">
        <img src="/ECD_logo.png" alt="ECD" />
        <span class="builder-hero-meta">v 0.7.12</span>
        </div>
        <RouterLink
          :to="{ name: switchRouteName }"
          class="app-switch-link btn-standard"
        >
          {{ switchRouteLabel }}
        </RouterLink>
      </div>

      <div class="app-topbar-actions">
        <button
          v-if="isBuilderRoute"
          class="btn-standard action-install"
          :disabled="!builderCanInstall || builderBusy"
          @click="triggerBuilderInstall"
        >
          Install
        </button>
        <button
          v-if="isBuilderRoute"
          class="btn-standard action-logs"
          :disabled="!builderCanLogs || builderBusy"
          @click="triggerBuilderLogs"
        >
          Logs
        </button>
        <button
          v-if="isBuilderRoute"
          class="btn-standard action-compile"
          :disabled="!builderCanCompile || builderBusy"
          @click="triggerBuilderCompile"
        >
          {{ builderBusy ? "Working..." : "Compile" }}
        </button>
        <button v-if="isBuilderRoute" class="btn-standard action-export" @click="triggerBuilderExport">
          Export
        </button>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

const route = useRoute();
const isBuilderRoute = computed(() => route.name === "builder");
const switchRouteName = computed(() => (isBuilderRoute.value ? "dashboard" : "builder"));
const switchRouteLabel = computed(() => (isBuilderRoute.value ? "Dashboard" : "Builder"));
const builderCanCompile = ref(false);
const builderCanInstall = ref(false);
const builderCanLogs = ref(false);
const builderBusy = ref(false);

const handleCompileState = (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  builderCanCompile.value = detail.canCompile === true;
  builderCanInstall.value = detail.canInstall === true;
  builderCanLogs.value = detail.canLogs === true;
  builderBusy.value = detail.running === true;
};

onMounted(() => {
  window.addEventListener("app:builder-compile-state", handleCompileState);
});

onBeforeUnmount(() => {
  window.removeEventListener("app:builder-compile-state", handleCompileState);
});

const triggerBuilderExport = () => {
  window.dispatchEvent(new CustomEvent("app:builder-export"));
};

const triggerBuilderCompile = () => {
  window.dispatchEvent(new CustomEvent("app:builder-compile"));
};

const triggerBuilderInstall = () => {
  window.dispatchEvent(new CustomEvent("app:builder-install"));
};

const triggerBuilderLogs = () => {
  window.dispatchEvent(new CustomEvent("app:builder-logs"));
};
</script>

<style scoped>
.app-shell {
  gap: 0;
}

.app-topbar {
  padding-top: 8px;
  padding-bottom: 8px;
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

.app-switch-link {
  text-decoration: none;
  background: #6190d6;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #6e93c4;
  border-radius: 4px;
  margin-left: 60px;
  width: 96px;
  justify-content: center;
}

.app-switch-link:hover {
  background: #537fbe;
}

.app-main {
  gap: 0;
  min-height: 0;
}
</style>
