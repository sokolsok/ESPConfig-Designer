import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT_FOLDER_ID = "root";

const defaultProjectsIndex = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  folders: [{ id: ROOT_FOLDER_ID, name: "All devices", parentId: null }],
  projectPlacement: []
});

const runtimeProjectsDir = path.resolve(process.cwd(), "runtime", "esp_projects");
const runtimeProjectsIndex = path.join(runtimeProjectsDir, "projects.json");

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
};

const runtimeProjectsPlugin = () => ({
  name: "runtime-projects-plugin",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      try {
        const method = String(req.method || "GET").toUpperCase();
        const url = new URL(req.url || "/", "http://localhost");
        let pathname = url.pathname;

        if (pathname.startsWith("/esp-builder/dev/projects")) {
          pathname = pathname.slice("/esp-builder/dev/projects".length) || "/";
        } else if (pathname.startsWith("/dev/projects")) {
          pathname = pathname.slice("/dev/projects".length) || "/";
        } else {
          next();
          return;
        }

        if (method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        await fs.mkdir(runtimeProjectsDir, { recursive: true });

        if (method === "GET" && pathname === "/list") {
          const entries = await fs.readdir(runtimeProjectsDir, { withFileTypes: true });
          const projects = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => name.toLowerCase().endsWith(".json") && name.toLowerCase() !== "projects.json")
            .sort((a, b) => a.localeCompare(b));
          sendJson(res, 200, { status: "ok", projects });
          return;
        }

        if (method === "GET" && pathname === "/index") {
          try {
            const raw = await fs.readFile(runtimeProjectsIndex, "utf8");
            const data = JSON.parse(raw);
            sendJson(res, 200, { status: "ok", name: "projects.json", data });
            return;
          } catch {
            sendJson(res, 200, { status: "ok", name: "projects.json", data: defaultProjectsIndex() });
            return;
          }
        }

        if (method === "POST" && pathname === "/index") {
          const data = await readJsonBody(req);
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            sendJson(res, 400, { status: "error", message: "Invalid JSON payload" });
            return;
          }
          const payload = { ...data, version: 1, updatedAt: new Date().toISOString() };
          await fs.writeFile(runtimeProjectsIndex, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
          sendJson(res, 200, { status: "ok", name: "projects.json", data: payload });
          return;
        }

        next();
      } catch (error) {
        sendJson(res, 500, { status: "error", message: error instanceof Error ? error.message : "Unknown error" });
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE || "./";

  return {
    plugins: [vue(), runtimeProjectsPlugin()],
    base,
    build: {
      outDir: "dist"
    }
  };
});
