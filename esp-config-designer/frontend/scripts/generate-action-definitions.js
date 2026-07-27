import path from "path";
import { fileURLToPath } from "node:url";

import { checkActionDefinitions, writeActionDefinitions } from "./action-definition-generator.js";

const defaultCatalogRoot = fileURLToPath(new URL("../../shared/schema-catalog/", import.meta.url));
const catalogRoot = path.resolve(process.env.ECD_SCHEMA_CATALOG_ROOT || defaultCatalogRoot);
const catalogPath = path.join(catalogRoot, "action_list", "base_actions.json");
const outputDir = path.join(catalogRoot, "actions");
const args = process.argv.slice(2);
const check = args.includes("--check");
const prune = args.includes("--prune");
const invalidArgs = args.some((arg) => arg !== "--check" && arg !== "--prune")
  || args.filter((arg) => arg === "--check").length > 1
  || args.filter((arg) => arg === "--prune").length > 1
  || (check && prune);

if (invalidArgs) {
  console.error("Usage: node scripts/generate-action-definitions.js [--check | --prune]");
  process.exitCode = 2;
} else if (check) {
  try {
    const { definitions, drift } = checkActionDefinitions({ catalogPath, outputDir });
    if (drift.length) {
      console.error(`Action definition drift detected in ${drift.length} file(s):`);
      drift.forEach((entry) => {
        if (entry.type === "case") {
          console.error(`  case: ${entry.actualPath} -> ${entry.path}`);
        } else {
          console.error(`  ${entry.type}: ${entry.path}`);
        }
      });
      if (drift.some((entry) => entry.type === "missing" || entry.type === "changed" || entry.type === "case")) {
        console.error("Run `node scripts/generate-action-definitions.js` to update missing, changed, or noncanonical files.");
      }
      if (drift.some((entry) => entry.type === "stale")) {
        console.error("Run `node scripts/generate-action-definitions.js --prune` to remove stale files.");
      }
      process.exitCode = 1;
    } else {
      console.log(`Action definitions are current (${definitions.length} files).`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  try {
    const { definitions, stale, pruned } = writeActionDefinitions({ catalogPath, outputDir, prune });
    console.log(`Generated ${definitions.length} action definitions.`);
    if (pruned.length) {
      console.log(`Pruned ${pruned.length} stale action definition file(s).`);
    }
    if (stale.length) {
      console.error(`Generation retained ${stale.length} stale file(s):`);
      stale.forEach((schemaPath) => console.error(`  stale: ${schemaPath}`));
      console.error("Run `node scripts/generate-action-definitions.js --prune` to remove stale generated JSON files.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
