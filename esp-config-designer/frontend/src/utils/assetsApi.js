const parseMessage = async (response, fallback) => {
  try {
    const payload = await response.json();
    const message = payload?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
};

export const fetchAssetsManifest = async (fetchApi, { kind = "all", refresh = false } = {}) => {
  const query = new URLSearchParams({ kind, refresh: refresh ? "1" : "0" });
  const response = await fetchApi(`api/assets/manifest?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await parseMessage(response, "Failed to load assets manifest"));
  }
  return response.json();
};

export const uploadAsset = async (fetchApi, { kind, file }) => {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);
  const response = await fetchApi(`api/assets/upload?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(await parseMessage(response, "Asset upload failed"));
  }
  return response.json();
};

export const renameAsset = async (fetchApi, { kind, from, to }) => {
  const response = await fetchApi("api/assets/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ kind, from, to })
  });
  if (!response.ok) {
    throw new Error(await parseMessage(response, "Asset rename failed"));
  }
  return response.json();
};

export const deleteAsset = async (fetchApi, { kind, file }) => {
  const encoded = encodeURIComponent(file);
  const response = await fetchApi(`api/assets/${encodeURIComponent(kind)}/${encoded}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(await parseMessage(response, "Asset delete failed"));
  }
  return response.json();
};

export const buildAssetUrl = (buildApiUrl, kind, file) => {
  if (!kind || !file) return "";
  const encodedKind = encodeURIComponent(kind);
  const encodedFile = encodeURIComponent(file);
  return buildApiUrl(`api/assets/${encodedKind}/${encodedFile}`);
};
