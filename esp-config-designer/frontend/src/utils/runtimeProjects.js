export const loadProjectsIndexFromBackend = async ({ fetchIndex, readFallback }) => {
  let response;
  try {
    response = await fetchIndex();
  } catch {
    return { data: await readFallback(), canPersist: false };
  }

  if (response.status === 404) {
    return { data: null, canPersist: true };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== "ok" || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new Error("Invalid projects index response");
  }
  return { data: payload.data, canPersist: true };
};
