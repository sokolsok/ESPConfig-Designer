<template>
  <div v-if="open" class="asset-manager-backdrop" @click.self="emit('close')">
    <section class="asset-manager" role="dialog" aria-modal="true" aria-label="Asset Manager" @click="openItemMenuKey = ''">
      <header class="asset-manager__header">
        <h3>Asset Manager</h3>
        <button type="button" class="secondary compact" :disabled="loading || working" @click="openUploadPicker">
          Upload
        </button>
      </header>

      <div class="asset-manager__toolbar">
        <div class="asset-manager__tabs">
          <button
            type="button"
            class="asset-manager__tab"
            :class="{ 'asset-manager__tab--active': activeKind === 'images' }"
            @click="activeKind = 'images'"
          >
            Images
          </button>
          <button
            type="button"
            class="asset-manager__tab"
            :class="{ 'asset-manager__tab--active': activeKind === 'fonts' }"
            @click="activeKind = 'fonts'"
          >
            Fonts
          </button>
          <button
            type="button"
            class="asset-manager__tab"
            :class="{ 'asset-manager__tab--active': activeKind === 'audio' }"
            @click="activeKind = 'audio'"
          >
            Audio
          </button>
        </div>
        <label class="asset-manager__search" for="assetManagerSearch">
          <img class="asset-manager__search-icon" src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/magnify.svg" alt="" />
          <input id="assetManagerSearch" v-model="search" type="search" placeholder="Search files" />
        </label>
      </div>

      <input ref="fileInput" class="asset-manager__file-input" type="file" :accept="acceptForKind" @change="handleFileInput" />

      <p v-if="error" class="asset-manager__error">{{ error }}</p>

      <div class="asset-manager__list">
        <div v-for="item in filteredItems" :key="`${activeKind}-${item.file}`" class="asset-item">
          <img v-if="activeKind === 'images'" class="asset-item__preview" :src="item.url" :alt="item.file" />
          <div v-else-if="activeKind === 'fonts'" class="asset-item__font">Aa</div>
          <div v-else class="asset-item__audio">
            <img src="https://cdn.jsdelivr.net/npm/@mdi/svg/svg/music-note.svg" alt="" aria-hidden="true" />
          </div>
          <div class="asset-item__meta">
            <div class="asset-item__name">{{ item.file }}</div>
            <div class="asset-item__details">
              <span>{{ formatSize(item.size) }}</span>
              <span>{{ formatDate(item.mtime) }}</span>
            </div>
          </div>
          <div v-if="canManageItem(item)" class="asset-item__menu-wrap" @click.stop>
            <button
              type="button"
              class="asset-item__menu-toggle"
              :disabled="loading || working"
              @click="toggleItemMenu(item)"
              aria-label="Asset actions"
            >
              ...
            </button>
            <div v-if="openItemMenuKey === menuKey(item)" class="asset-item__menu">
              <button type="button" :disabled="loading || working" @click="handleRename(item)">Rename</button>
              <button type="button" :disabled="loading || working" @click="handleDelete(item)">Delete</button>
            </div>
          </div>
        </div>
        <div v-if="!filteredItems.length" class="asset-manager__empty">No files found.</div>
      </div>

      <footer class="asset-manager__footer">
        <button type="button" class="secondary compact" @click="emit('close')">Close</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  images: {
    type: Array,
    default: () => []
  },
  fonts: {
    type: Array,
    default: () => []
  },
  audio: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  working: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["close", "refresh", "upload", "rename", "delete-asset"]);

const activeKind = ref("images");
const fileInput = ref(null);
const search = ref("");
const openItemMenuKey = ref("");
const ALLOWED_KINDS = ["images", "fonts", "audio"];

const items = computed(() => {
  if (activeKind.value === "images") return props.images;
  if (activeKind.value === "fonts") return props.fonts;
  return props.audio;
});
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return items.value;
  return items.value.filter((item) => String(item?.file || "").toLowerCase().includes(query));
});

const acceptForKind = computed(() => {
  if (activeKind.value === "images") return ".png,.bmp,.gif";
  if (activeKind.value === "fonts") return ".ttf,.otf";
  return ".mp3,.wav,.ogg";
});
watch(
  () => props.open,
  (value) => {
    if (!value) return;
    emit("refresh");
    search.value = "";
    openItemMenuKey.value = "";
    if (fileInput.value) {
      fileInput.value.value = "";
    }
  }
);

watch(
  () => activeKind.value,
  () => {
    openItemMenuKey.value = "";
  }
);

const handleFileInput = (event) => {
  const file = event.target.files?.[0] || null;
  if (!file) return;
  const kind = ALLOWED_KINDS.includes(activeKind.value) ? activeKind.value : "images";
  emit("upload", { kind, file });
  if (fileInput.value) {
    fileInput.value.value = "";
  }
};

const openUploadPicker = () => {
  if (!fileInput.value || props.loading || props.working) return;
  fileInput.value.click();
};

const handleRename = (item) => {
  openItemMenuKey.value = "";
  const current = String(item?.file || "");
  if (!current) return;
  const next = window.prompt("New file name", current);
  if (!next) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === current) return;
  const kind = ALLOWED_KINDS.includes(activeKind.value) ? activeKind.value : "images";
  emit("rename", { kind, from: current, to: trimmed });
};

const handleDelete = (item) => {
  openItemMenuKey.value = "";
  const file = String(item?.file || "");
  if (!file) return;
  const confirmed = window.confirm(`Delete ${file}?`);
  if (!confirmed) return;
  const kind = ALLOWED_KINDS.includes(activeKind.value) ? activeKind.value : "images";
  emit("delete-asset", { kind, file });
};

const formatSize = (value) => {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

const menuKey = (item) => `${activeKind.value}:${String(item?.file || "")}`;

const isProtectedFont = (item) => {
  if (activeKind.value !== "fonts") return false;
  return String(item?.file || "").trim().toLowerCase() === "materialdesignicons-webfont.ttf";
};

const canManageItem = (item) => !isProtectedFont(item);

const toggleItemMenu = (item) => {
  const key = menuKey(item);
  openItemMenuKey.value = openItemMenuKey.value === key ? "" : key;
};
</script>

<style scoped>
.asset-manager-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 1300;
}

.asset-manager {
  width: min(980px, 94vw);
  height: 630px;
  max-height: 88vh;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #dbe2ee;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asset-manager__header,
.asset-manager__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.asset-manager__toolbar {
  gap: 12px;
}

.asset-manager__header h3 {
  margin: 0;
}

.asset-manager__tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.asset-manager__tab {
  min-width: 64px;
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid #cfd6e3;
  background: #eef1f6;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.asset-manager__search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  margin-top: 4px;
  box-sizing: border-box;
  background: #f7f9fc;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  padding: 0 10px;
}

.asset-manager__search-icon {
  width: 22px;
  height: 22px;
  opacity: 0.7;
}

.asset-manager__search input {
  width: 100%;
  border: none;
  background: transparent;
  font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 16px;
  color: #475569;
  padding: 0;
}

.asset-manager__search input:focus,
.asset-manager__search input:focus-visible {
  box-shadow: none;
  outline: none;
}

.asset-manager__search input::placeholder {
  color: #c0cae2;
}

.asset-manager__tab--active {
  border-color: #6190d6;
  background: #6190d6;
  color: #f8fafc;
}

.asset-manager__file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.asset-manager__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.asset-manager__list {
  overflow: auto;
  border: 1px solid #d9e1f2;
  border-radius: 4px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  background: #ebeffa;
  min-height: 0;
  flex: 1;
  align-content: start;
}

.asset-item {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 6px;
  align-items: stretch;
  border: 1px solid #d5deef;
  border-radius: 4px;
  padding: 8px;
  background: #ffffff;
  min-height: 98px;
  position: relative;
}

.asset-item__menu-wrap {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  position: relative;
  grid-column: 3;
  grid-row: 2;
}

.asset-item__preview,
.asset-item__font,
.asset-item__audio {
  width: 96px;
  height: 82px;
  border: none;
  border-radius: 4px;
  background: #f7f9fc;
  grid-column: 1;
  grid-row: 1 / span 2;
}

.asset-item__preview {
  object-fit: contain;
}

.asset-item__font {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #0f172a;
  font-size: 22px;
}

.asset-item__audio {
  display: grid;
  place-items: center;
  color: #3e5a88;
}

.asset-item__audio img {
  width: 30px;
  height: 30px;
}

.asset-item__meta {
  min-width: 0;
  grid-column: 2;
  grid-row: 1 / span 2;
  display: grid;
  grid-template-rows: auto auto;
  row-gap: 2px;
  align-content: end;
}

.asset-item__name {
  font-weight: 600;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-item__details {
  color: #64748b;
  font-size: 12px;
  display: grid;
  gap: 2px;
}

.asset-item__menu-toggle {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  line-height: 0.8;
  font-weight: 700;
  font-size: 14px;
  padding: 0;
}

.asset-item__menu-toggle:hover {
  background: #e3ebf8;
}

.asset-item__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 130px;
  border: 1px solid #d1dbea;
  background: #f7f9fc;
  border-radius: 4px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.15);
  z-index: 5;
  overflow: hidden;
  padding: 2px;
  display: grid;
  gap: 2px;
}

.asset-item__menu button {
  width: 100%;
  border: 1px solid #c5d2e6;
  border-radius: 3px;
  background: #eef3fd;
  text-align: left;
  padding: 5px 8px;
  font-size: 12px;
  color: #0f172a !important;
}

.asset-item__menu button:hover {
  background: #e3ebf8;
}

.asset-manager__empty {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 13px;
  text-align: center;
  padding: 24px 8px;
}

.asset-manager__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.asset-manager__footer .secondary.compact {
  height: 32px;
  padding: 0 12px;
}

@media (max-width: 980px) {
  .asset-manager__list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .asset-manager__list {
    grid-template-columns: 1fr;
  }
}
</style>
