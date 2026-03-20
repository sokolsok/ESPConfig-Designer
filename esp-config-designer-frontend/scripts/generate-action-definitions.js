import path from "path";

import { writeActionDefinitions } from "./action-definition-generator.js";

const rootDir = process.cwd();

const definitions = writeActionDefinitions({
  catalogPath: path.join(rootDir, "public", "action_list", "base_actions.json"),
  outputDir: path.join(rootDir, "public", "actions")
});

console.log(`Generated ${definitions.length} action definitions.`);
