import { ref } from 'vue';
import { mergeDeviceStatusCache, readDeviceStatusCache } from '../../utils/deviceStatusCache';
import { isProjectOnlineForDeployment, resolveActiveDeploymentHost } from '../../utils/projectDeploymentState';

// useDashboardDeviceStatus keeps dashboard polling isolated from the dashboard UI.
// It merges backend status data with the lightweight local cache and exposes a
// stable online/offline API for project cards and dashboard actions.

export const useDashboardDeviceStatus = ({
  fetchJson,
  getApiUrl,
  projectKeyFromName,
  projectDeploymentState,
  hostFromYamlName,
  projectYamlName,
  deviceKeyFromPayload,
  promotePendingDeploymentsIfNeeded,
  pollIntervalMs = 5000
}) => {
  const onlineProjectKeys = ref(new Set());
  const projectHosts = ref(new Map());
  let devicesStatusPollId = null;

  const applyCachedDeviceStatus = () => {
    const cache = readDeviceStatusCache();
    const hosts = new Map();
    const onlineKeys = [];
    Object.entries(cache).forEach(([projectKey, entry]) => {
      const key = projectKeyFromName(projectKey);
      if (!key) return;
      const status = String(entry?.status || '').toLowerCase();
      const host = String(entry?.host || '').trim();
      if (host) hosts.set(key, host);
      if (status === 'online') onlineKeys.push(key);
    });
    if (onlineKeys.length) onlineProjectKeys.value = new Set(onlineKeys);
    if (hosts.size) projectHosts.value = hosts;
  };

  const refreshOnlineProjects = async () => {
    try {
      const response = await fetchJson(getApiUrl('api/devices/list?refresh=1'));
      if (!response.ok) return;
      const payload = await response.json();
      const devices = Array.isArray(payload?.devices) ? payload.devices : [];
      const hostsByProject = new Map();
      const cacheEntries = {};
      const onlineKeys = devices
        .filter((device) => {
          const deviceKey = deviceKeyFromPayload(device);
          if (!deviceKey) return false;
          const yamlName = `${deviceKey}.yaml`;
          const fallbackHost = hostFromYamlName(yamlName);
          const host = String(device?.host || fallbackHost).trim();
          if (host) hostsByProject.set(deviceKey, host);
          const status = String(device?.status || '').toLowerCase() === 'online' ? 'online' : 'offline';
          cacheEntries[deviceKey] = {
            status,
            host,
            name: String(device?.name || '').trim(),
            updatedAt: Date.now()
          };
          return status === 'online';
        })
        .map((device) => deviceKeyFromPayload(device))
        .filter(Boolean);
      const onlineKeySet = new Set(onlineKeys);
      onlineProjectKeys.value = onlineKeySet;
      projectHosts.value = hostsByProject;
      mergeDeviceStatusCache(cacheEntries);
      await promotePendingDeploymentsIfNeeded(onlineKeySet);
    } catch {
      // keep previous known in-memory state
    }
  };

  const startDevicesStatusPolling = () => {
    if (document.visibilityState !== 'visible') return;
    if (devicesStatusPollId) return;
    devicesStatusPollId = setInterval(() => {
      refreshOnlineProjects();
    }, pollIntervalMs);
  };

  const stopDevicesStatusPolling = () => {
    if (!devicesStatusPollId) return;
    clearInterval(devicesStatusPollId);
    devicesStatusPollId = null;
  };

  const handleDashboardVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      refreshOnlineProjects();
      startDevicesStatusPolling();
      return;
    }
    stopDevicesStatusPolling();
  };

  const projectStatusHost = (projectName) => {
    const deployment = projectDeploymentState.value.get(projectName) || { active: null, pending: null };
    return resolveActiveDeploymentHost(
      deployment,
      projectHosts.value,
      hostFromYamlName(projectYamlName(projectName))
    );
  };

  const isProjectOnline = (projectName) => {
    const deployment = projectDeploymentState.value.get(projectName) || { active: null, pending: null };
    return isProjectOnlineForDeployment(
      deployment,
      onlineProjectKeys.value,
      projectKeyFromName(projectName)
    );
  };

  return {
    applyCachedDeviceStatus,
    handleDashboardVisibilityChange,
    isProjectOnline,
    onlineProjectKeys,
    projectHosts,
    projectStatusHost,
    refreshOnlineProjects,
    startDevicesStatusPolling,
    stopDevicesStatusPolling
  };
};
