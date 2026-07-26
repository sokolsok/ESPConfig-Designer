import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import packageJson from "./package.json";
import {
  createBackendProxy,
  resolveDevProxyTarget
} from "./vite.config.helpers.js";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const base = env.VITE_BASE || "./";
  const proxyTarget = resolveDevProxyTarget(env);

  return {
    plugins: [vue()],
    base,
    server: {
      proxy: createBackendProxy(proxyTarget)
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    },
    build: {
      outDir: "dist"
    }
  };
});
