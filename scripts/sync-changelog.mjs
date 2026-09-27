import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function syncChangelog(root) {
  const repositoryRoot = resolve(root);
  const sourcePath = resolve(repositoryRoot, "CHANGELOG.md");
  const projectionPath = resolve(repositoryRoot, "esp-config-designer/CHANGELOG.md");
  const source = await readFile(sourcePath);
  let projection;

  try {
    projection = await readFile(projectionPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (projection?.equals(source)) return false;
  await writeFile(projectionPath, source);
  return true;
}

async function main() {
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptRoot, "..");
  const changed = await syncChangelog(repositoryRoot);
  console.log(`Home Assistant changelog projection: ${changed ? "UPDATED" : "CURRENT"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
