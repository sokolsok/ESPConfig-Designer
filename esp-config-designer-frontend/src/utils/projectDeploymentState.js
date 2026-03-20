import { normalizeProjectKey } from "./deviceStatusCache";

const normalizeIdentity = (value) => {
  if (!value || typeof value !== "object") return null;
  const deviceKey = normalizeProjectKey(value.deviceKey || value.name || value.yaml || "");
  if (!deviceKey) return null;
  const yamlRaw = String(value.yaml || "").trim();
  const yaml = yamlRaw || `${deviceKey}.yaml`;
  const host = String(value.host || "").trim();
  const updatedAt = String(value.updatedAt || "").trim() || new Date().toISOString();
  return {
    deviceKey,
    yaml,
    host,
    updatedAt
  };
};

const identitiesEqual = (left, right) => {
  const a = normalizeIdentity(left);
  const b = normalizeIdentity(right);
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.deviceKey === b.deviceKey && a.host === b.host;
};

const statesEqual = (left, right) => {
  return identitiesEqual(left?.active, right?.active) && identitiesEqual(left?.pending, right?.pending);
};

const dedupeKeys = (keys) => {
  const seen = new Set();
  const result = [];
  (keys || []).forEach((key) => {
    const normalized = normalizeProjectKey(key);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

export const createDeploymentIdentityFromYaml = (yamlName, host = "") => {
  const normalizedYaml = String(yamlName || "").trim();
  const deviceKey = normalizeProjectKey(normalizedYaml);
  if (!deviceKey) return null;
  return {
    deviceKey,
    yaml: normalizedYaml || `${deviceKey}.yaml`,
    host: String(host || "").trim(),
    updatedAt: new Date().toISOString()
  };
};

export const readProjectDeploymentState = (data) => {
  const deployment = data?.deployment && typeof data.deployment === "object" ? data.deployment : {};
  let active = normalizeIdentity(deployment.active);
  let pending = normalizeIdentity(deployment.pending);

  if (!active) {
    active = normalizeIdentity(deployment.lastInstalled);
  }

  if (active && pending && active.deviceKey === pending.deviceKey) {
    pending = null;
  }

  return { active, pending };
};

export const writeProjectDeploymentState = (data, state) => {
  const target = data && typeof data === "object" ? data : {};
  const deployment = target.deployment && typeof target.deployment === "object" ? { ...target.deployment } : {};
  const active = normalizeIdentity(state?.active);
  let pending = normalizeIdentity(state?.pending);

  if (active && pending && active.deviceKey === pending.deviceKey) {
    pending = null;
  }

  if (active) {
    deployment.active = active;
  } else {
    delete deployment.active;
  }

  if (pending) {
    deployment.pending = pending;
  } else {
    delete deployment.pending;
  }

  delete deployment.lastInstalled;

  if (Object.keys(deployment).length) {
    target.deployment = deployment;
  } else {
    delete target.deployment;
  }

  return target;
};

export const isProjectOnlineForDeployment = (state, onlineKeys, fallbackDeviceKey = "") => {
  const set = onlineKeys instanceof Set ? onlineKeys : new Set();
  const activeKey = normalizeProjectKey(state?.active?.deviceKey || "");
  const pendingKey = normalizeProjectKey(state?.pending?.deviceKey || "");
  const fallbackKey = normalizeProjectKey(fallbackDeviceKey || "");
  if (activeKey && set.has(activeKey)) return true;
  if (pendingKey && set.has(pendingKey)) return true;
  if (!activeKey && !pendingKey && fallbackKey && set.has(fallbackKey)) return true;
  return false;
};

export const resolveActiveDeploymentKey = (state, fallbackDeviceKey = "") => {
  const activeKey = normalizeProjectKey(state?.active?.deviceKey || "");
  if (activeKey) return activeKey;
  return normalizeProjectKey(fallbackDeviceKey || "");
};

export const resolveActiveDeploymentHost = (state, hostsByDeviceKey, fallbackHost = "") => {
  const activeKey = resolveActiveDeploymentKey(state, "");
  if (activeKey && hostsByDeviceKey instanceof Map) {
    const mappedHost = String(hostsByDeviceKey.get(activeKey) || "").trim();
    if (mappedHost) return mappedHost;
  }
  const activeHost = String(state?.active?.host || "").trim();
  if (activeHost) return activeHost;
  return String(fallbackHost || "").trim();
};

export const computePostInstallDeploymentUpdate = ({ action, currentState, nextIdentity }) => {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const current = {
    active: normalizeIdentity(currentState?.active),
    pending: normalizeIdentity(currentState?.pending)
  };
  const next = normalizeIdentity(nextIdentity);
  if (!next || !["flash", "ota", "download"].includes(normalizedAction)) {
    return {
      state: current,
      register: null,
      unregisterKeys: [],
      changed: false
    };
  }

  const unregisterKeys = [];
  let register = null;
  let state = {
    active: current.active,
    pending: current.pending
  };

  if (normalizedAction === "download") {
    const activeKey = current.active?.deviceKey || "";
    const pendingKey = current.pending?.deviceKey || "";
    if (activeKey && activeKey === next.deviceKey) {
      if (pendingKey && pendingKey !== activeKey) {
        unregisterKeys.push(pendingKey);
      }
      state = {
        active: current.active,
        pending: null
      };
    } else {
      if (!identitiesEqual(current.pending, next)) {
        register = next;
      }
      if (pendingKey && pendingKey !== next.deviceKey && pendingKey !== activeKey) {
        unregisterKeys.push(pendingKey);
      }
      state = {
        active: current.active,
        pending: next
      };
    }
  } else {
    if (!identitiesEqual(current.active, next)) {
      register = next;
    }
    const activeKey = current.active?.deviceKey || "";
    const pendingKey = current.pending?.deviceKey || "";
    if (activeKey && activeKey !== next.deviceKey) {
      unregisterKeys.push(activeKey);
    }
    if (pendingKey && pendingKey !== next.deviceKey) {
      unregisterKeys.push(pendingKey);
    }
    state = {
      active: next,
      pending: null
    };
  }

  return {
    state,
    register,
    unregisterKeys: dedupeKeys(unregisterKeys),
    changed: !statesEqual(current, state)
  };
};

export const computePendingPromotion = ({ currentState, onlineKeys }) => {
  const set = onlineKeys instanceof Set ? onlineKeys : new Set();
  const current = {
    active: normalizeIdentity(currentState?.active),
    pending: normalizeIdentity(currentState?.pending)
  };
  const pending = current.pending;
  if (!pending) {
    return {
      shouldPromote: false,
      state: current,
      unregisterKeys: []
    };
  }

  const pendingOnline = set.has(pending.deviceKey);
  if (!pendingOnline) {
    return {
      shouldPromote: false,
      state: current,
      unregisterKeys: []
    };
  }

  const active = current.active;
  const activeOnline = active?.deviceKey ? set.has(active.deviceKey) : false;
  if (active && activeOnline) {
    return {
      shouldPromote: false,
      state: current,
      unregisterKeys: []
    };
  }

  const unregisterKeys = [];
  if (active?.deviceKey && active.deviceKey !== pending.deviceKey) {
    unregisterKeys.push(active.deviceKey);
  }

  return {
    shouldPromote: true,
    state: {
      active: pending,
      pending: null
    },
    unregisterKeys: dedupeKeys(unregisterKeys)
  };
};
