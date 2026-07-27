import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const CATALOG_DIRECTORIES = [
  "action_list",
  "actions",
  "components_list",
  "condition_list",
  "conditions",
  "gpio",
  "schemas"
];

const CATALOG_EXTENDS_TARGETS = new Map([
  ["base_actions.json", "action_list/base_actions.json"],
  ["base_binary_sensor_filters.json", "schemas/components/base_component/base_binary_sensor_filters.json"],
  ["base_conditions.json", "condition_list/base_conditions.json"],
  ["base_filters.json", "schemas/components/base_component/base_filters.json"]
]);

const REQUIRED_GENERAL_SCHEMAS = new Set([
  "schemas/general/automation/deep_sleep.json",
  "schemas/general/automation/globals.json",
  "schemas/general/automation/interval.json",
  "schemas/general/automation/script.json",
  "schemas/general/automation/timezones.json",
  "schemas/general/busses/canbus.json",
  "schemas/general/busses/i2c.json",
  "schemas/general/busses/i2s.json",
  "schemas/general/busses/modbus.json",
  "schemas/general/busses/one_wire.json",
  "schemas/general/busses/spi.json",
  "schemas/general/busses/uart.json",
  "schemas/general/core/core.json",
  "schemas/general/core/substitutions.json",
  "schemas/general/network/ethernet.json",
  "schemas/general/network/network.json",
  "schemas/general/network/wifi.json",
  "schemas/general/platform/bk72xx.json",
  "schemas/general/platform/esp32.json",
  "schemas/general/platform/esp8266.json",
  "schemas/general/platform/host.json",
  "schemas/general/platform/ln882x.json",
  "schemas/general/platform/nrf52.json",
  "schemas/general/platform/platform.json",
  "schemas/general/platform/rp2040.json",
  "schemas/general/platform/rtl87xx.json",
  "schemas/general/protocols/api.json",
  "schemas/general/protocols/esp-now.json",
  "schemas/general/protocols/mqtt.json",
  "schemas/general/system/debug.json",
  "schemas/general/system/logger.json",
  "schemas/general/system/psram.json",
  "schemas/general/system/status_led.json"
]);

const COMPONENT_SCHEMA_DIRECTORY_EXCEPTIONS = new Map([
  ["camera/camera_encoder", "miscellaneous"]
]);

const COMPONENT_SCHEMA_IDENTITY_EXCEPTIONS = new Map([
  ["camera/camera_encoder", { id: "camera_encoder", domain: "camera_encoder", platform: "" }],
  ["display/ssd1331", { id: "display.ssd1331_spi", domain: "display", platform: "ssd1331_spi" }],
  ["matrix_keypad", { id: "binary_sensor.matrix_keypad", domain: "binary_sensor", platform: "matrix_keypad" }]
]);

const COMPONENT_PLATFORM_ALIASES = new Map([
  ["climate/climate_ir", "climate_ir_lg"],
  ["display/lcd_display", "lcd_pcf8574"],
  ["display/ssd1306", "ssd1306_i2c"],
  ["display/ssd1322", "ssd1322_spi"],
  ["display/ssd1325", "ssd1325_spi"],
  ["display/ssd1327", "ssd1327_i2c"],
  ["display/ssd1351", "ssd1351_spi"],
  ["display/st7567", "st7567_i2c"],
  ["light/fastled", "fastled_clockless"],
  ["sensor/ade7953", "ade7953_i2c"],
  ["sensor/airthings_ble", "airthings_wave_plus"],
  ["sensor/bme280", "bme280_i2c"],
  ["sensor/bmp280", "bmp280_i2c"],
  ["sensor/bmp3xx", "bmp3xx_i2c"],
  ["sensor/ens160", "ens160_i2c"],
  ["sensor/gl_r01", "gl_r01_i2c"],
  ["sensor/ina2xx", "ina2xx_i2c"],
  ["sensor/radon_eye_ble", "radon_eye_rd200"]
]);

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const COMPONENT_TOKEN = /^[a-z0-9][a-z0-9_-]*$/u;
const SINGLETON_CATALOG_FILES = new Set([
  "action_list/base_actions.json",
  "components_list/components_list.json",
  "condition_list/base_conditions.json",
  "gpio/gpio-map.json"
]);

const toPosixPath = (value) => value.split(path.sep).join("/");

const requireDirectoryRoot = (root, label) => {
  const entry = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`${label} does not exist or is a symbolic link: ${root}`);
  }
};

const normalizeComponentTokens = (value, label, minimumParts = 1) => {
  if (typeof value !== "string" || value.trim() !== value || value !== value.toLowerCase() || value.includes("\\")) {
    throw new Error(`${label} must contain normalized component tokens`);
  }
  const parts = value.split("/");
  if (parts.length < minimumParts || parts.some((part) => !COMPONENT_TOKEN.test(part))) {
    throw new Error(`${label} must contain at least ${minimumParts} normalized tokens`);
  }
  return value;
};

const assertPortablePath = (value, label) => {
  for (const segment of value.split("/")) {
    if (
      !segment
      || /[<>:"\\|?*\u0000-\u001f]/u.test(segment)
      || segment.endsWith(".")
      || segment.endsWith(" ")
      || WINDOWS_RESERVED_NAMES.test(segment)
    ) {
      throw new Error(`${label} is not portable across Windows and Linux: ${value}`);
    }
  }
};

const listFiles = (root) => {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Schema catalog must not contain symlinks: ${toPosixPath(path.relative(root, entryPath))}`);
      }
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      } else {
        throw new Error(`Unsupported schema catalog entry: ${toPosixPath(path.relative(root, entryPath))}`);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
};

const listDirectories = (root) => {
  const directories = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(current, entry.name);
      directories.push(entryPath);
      stack.push(entryPath);
    }
  }
  return directories.sort((left, right) => left.localeCompare(right));
};

const normalizeJsonPath = (value, label) => {
  if (typeof value !== "string" || !value || value.trim() !== value || value.includes("\\")) {
    throw new Error(`${label} must be a relative normalized JSON path`);
  }
  const normalized = path.posix.normalize(value);
  const segments = value.split("/");
  if (
    normalized !== value
    || value.startsWith("/")
    || !value.toLowerCase().endsWith(".json")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a relative normalized JSON path: ${value}`);
  }
  assertPortablePath(value, label);
  return value;
};

const readJson = (filePath, root) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const relativePath = toPosixPath(path.relative(root, filePath));
    throw new Error(`Invalid catalog JSON '${relativePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
};

const validateCatalogDefinitions = ({
  jsonByPath,
  catalogPath,
  property,
  directory,
  kind
}) => {
  const catalog = jsonByPath.get(catalogPath);
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(`${catalogPath} must contain an object`);
  }
  const entries = requireArray(catalog[property], `${catalogPath}.${property}`);
  const ids = new Set();
  const urls = new Set();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    if (!id || ids.has(id)) {
      throw new Error(`${kind} catalog contains an empty or duplicate id: ${id || "<empty>"}`);
    }
    ids.add(id);
    const schemaUrl = normalizeJsonPath(entry.schemaUrl, `${kind} '${id}' schemaUrl`);
    const expectedUrl = `${directory}/${id.replaceAll(".", "/")}.json`;
    if (schemaUrl !== expectedUrl) {
      throw new Error(`${kind} '${id}' schemaUrl must be '${expectedUrl}'`);
    }
    const foldedUrl = schemaUrl.toLowerCase();
    if (urls.has(foldedUrl)) {
      throw new Error(`${kind} catalog contains a duplicate schemaUrl: ${schemaUrl}`);
    }
    urls.add(foldedUrl);
    const definition = jsonByPath.get(schemaUrl);
    if (!definition) {
      throw new Error(`missing ${kind} definition: ${schemaUrl}`);
    }
    if (!definition || typeof definition !== "object" || Array.isArray(definition) || !Array.isArray(definition.fields)) {
      throw new Error(`${kind} definition '${schemaUrl}' must contain an object with fields`);
    }
    if (definition.id !== id) {
      throw new Error(`${kind} definition '${schemaUrl}' has id '${definition.id}' instead of '${id}'`);
    }
  }

  const definitionFiles = [...jsonByPath.keys()].filter((relativePath) => relativePath.startsWith(`${directory}/`));
  for (const definitionPath of definitionFiles) {
    if (!urls.has(definitionPath.toLowerCase())) {
      throw new Error(`unreferenced ${kind} definition: ${definitionPath}`);
    }
  }
  return entries.length;
};

const visitSchemaReferences = (value, context, jsonByPath, helperReferences) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitSchemaReferences(item, `${context}[${index}]`, jsonByPath, helperReferences));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  if (Object.hasOwn(value, "extends")) {
    if (typeof value.extends !== "string") {
      throw new Error(`${context}.extends must be a string`);
    }
    const catalogTarget = CATALOG_EXTENDS_TARGETS.get(value.extends);
    if (catalogTarget) {
      if (!jsonByPath.has(catalogTarget)) {
        throw new Error(`unresolved extends '${value.extends}' in ${context}`);
      }
      if (catalogTarget.startsWith("schemas/components/base_component/")) {
        helperReferences.add(catalogTarget);
      }
    } else {
      const reference = normalizeJsonPath(value.extends, `${context}.extends`);
      const target = `schemas/components/base_component/${reference}`;
      if (!jsonByPath.has(target)) {
        throw new Error(`unresolved extends '${reference}' in ${context}`);
      }
      helperReferences.add(target);
    }
  }

  if (Object.hasOwn(value, "optionsFrom")) {
    const reference = normalizeJsonPath(value.optionsFrom, `${context}.optionsFrom`);
    const target = `schemas/${reference}`;
    if (!jsonByPath.has(target)) {
      throw new Error(`unresolved optionsFrom '${reference}' in ${context}`);
    }
    if (target.startsWith("schemas/components/base_component/")) {
      helperReferences.add(target);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    visitSchemaReferences(child, `${context}.${key}`, jsonByPath, helperReferences);
  }
};

const expectedComponentIdentity = (componentId) => {
  const exception = COMPONENT_SCHEMA_IDENTITY_EXCEPTIONS.get(componentId);
  if (exception) return exception;
  const segments = componentId.split("/");
  if (segments.length === 1) {
    return { id: componentId, domain: componentId, platform: "" };
  }
  if (segments.length !== 2) {
    throw new Error(`component id has unsupported nesting: ${componentId}`);
  }
  const platform = COMPONENT_PLATFORM_ALIASES.get(componentId) || segments[1];
  return { id: `${segments[0]}.${segments[1]}`, domain: segments[0], platform };
};

const collectComponentPlacements = (
  categories,
  jsonByPath,
  componentSchemaPaths,
  relationshipsById,
  relationshipsByLookupKey,
  context = "components_list.categories"
) => {
  let count = 0;
  requireArray(categories, context).forEach((category, categoryIndex) => {
    const categoryContext = `${context}[${categoryIndex}]`;
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw new Error(`${categoryContext} must be an object`);
    }
    requireArray(category.items, `${categoryContext}.items`).forEach((item, itemIndex) => {
      const itemContext = `${categoryContext}.items[${itemIndex}]`;
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id) {
        throw new Error(`${itemContext} must contain a non-empty id`);
      }
      const schemaPath = normalizeJsonPath(item.schemaPath, `${itemContext}.schemaPath`);
      normalizeComponentTokens(item.id, `${itemContext}.id`);
      if (schemaPath !== schemaPath.toLowerCase()) {
        throw new Error(`${itemContext}.schemaPath must use lowercase component tokens`);
      }
      if (!schemaPath.startsWith("components/")) {
        throw new Error(`${itemContext}.schemaPath must be under components/: ${schemaPath}`);
      }
      if (!jsonByPath.has(`schemas/${schemaPath}`)) {
        throw new Error(`missing component schema '${schemaPath}' for '${item.id}'`);
      }
      const idSegments = item.id.split("/");
      if (path.posix.basename(schemaPath, ".json") !== idSegments.at(-1)) {
        throw new Error(`component '${item.id}' schemaPath does not match its id: ${schemaPath}`);
      }
      if (idSegments.length > 1) {
        const schemaDirectory = schemaPath.split("/")[1];
        const expectedDirectory = COMPONENT_SCHEMA_DIRECTORY_EXCEPTIONS.get(item.id) || idSegments[0];
        if (schemaDirectory !== expectedDirectory) {
          throw new Error(`component '${item.id}' schemaPath must be under components/${expectedDirectory}/`);
        }
      }
      const schema = jsonByPath.get(`schemas/${schemaPath}`);
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error(`component '${item.id}' schema must contain an object`);
      }
      const expectedIdentity = expectedComponentIdentity(item.id);
      const actualIdentity = {
        id: typeof schema.id === "string" ? schema.id : "",
        domain: typeof schema.domain === "string" ? schema.domain : "",
        platform: typeof schema.platform === "string" ? schema.platform : ""
      };
      if (
        actualIdentity.id !== expectedIdentity.id
        || actualIdentity.domain !== expectedIdentity.domain
        || actualIdentity.platform !== expectedIdentity.platform
      ) {
        throw new Error(`component '${item.id}' schema identity does not match its catalog entry`);
      }
      const relationship = {
        path: typeof item.path === "string" ? item.path : "",
        schemaPath
      };
      const componentPath = relationship.path.startsWith("components/") ? relationship.path.slice("components/".length) : "";
      if (
        !componentPath
        || relationship.path.trim() !== relationship.path
        || relationship.path !== relationship.path.toLowerCase()
        || relationship.path.includes("\\")
        || componentPath.split("/").some((part) => !COMPONENT_TOKEN.test(part))
      ) {
        throw new Error(`${itemContext}.path must be a normalized component path`);
      }
      if (Object.hasOwn(item, "catalogKey") && item.catalogKey !== null) {
        normalizeComponentTokens(item.catalogKey, `${itemContext}.catalogKey`, 2);
      }
      const lookupRelationship = {
        id: item.id,
        path: relationship.path,
        schemaPath
      };
      for (const lookupKey of [item.id, item.catalogKey, relationship.path].filter(Boolean)) {
        const existingLookup = relationshipsByLookupKey.get(lookupKey);
        if (
          existingLookup
          && (
            existingLookup.id !== lookupRelationship.id
            || existingLookup.path !== lookupRelationship.path
            || existingLookup.schemaPath !== lookupRelationship.schemaPath
          )
        ) {
          throw new Error(`component lookup key '${lookupKey}' resolves to conflicting catalog entries`);
        }
        relationshipsByLookupKey.set(lookupKey, lookupRelationship);
      }
      const existingRelationship = relationshipsById.get(item.id);
      if (
        existingRelationship
        && (existingRelationship.path !== relationship.path || existingRelationship.schemaPath !== relationship.schemaPath)
      ) {
        throw new Error(`component '${item.id}' has conflicting path or schemaPath placements`);
      }
      relationshipsById.set(item.id, relationship);
      componentSchemaPaths.add(`schemas/${schemaPath}`);
      count += 1;
    });
    count += collectComponentPlacements(
      requireArray(category.subcategories, `${categoryContext}.subcategories`),
      jsonByPath,
      componentSchemaPaths,
      relationshipsById,
      relationshipsByLookupKey,
      `${categoryContext}.subcategories`
    );
  });
  return count;
};

export const validateSchemaCatalog = (catalogRoot) => {
  const root = path.resolve(catalogRoot);
  requireDirectoryRoot(root, "Schema catalog root");
  for (const directory of CATALOG_DIRECTORIES) {
    if (!fs.statSync(path.join(root, directory), { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Schema catalog directory is missing: ${directory}`);
    }
  }

  const allFiles = listFiles(root);
  const catalogFiles = [];
  const foldedPaths = new Map();
  for (const filePath of allFiles) {
    const relativePath = toPosixPath(path.relative(root, filePath));
    assertPortablePath(relativePath, "Schema catalog path");
    const topLevel = relativePath.split("/", 1)[0];
    if (!CATALOG_DIRECTORIES.includes(topLevel)) {
      throw new Error(`Unexpected file in schema catalog root: ${relativePath}`);
    }
    const foldedPath = relativePath.toLowerCase();
    const existing = foldedPaths.get(foldedPath);
    if (existing && existing !== relativePath) {
      throw new Error(`Case-insensitive schema catalog path collision: ${existing} and ${relativePath}`);
    }
    foldedPaths.set(foldedPath, relativePath);
    catalogFiles.push({ filePath, relativePath });
  }
  for (const { relativePath } of catalogFiles) {
    const topLevel = relativePath.split("/", 1)[0];
    if (["action_list", "components_list", "condition_list", "gpio"].includes(topLevel)
      && !SINGLETON_CATALOG_FILES.has(relativePath)) {
      throw new Error(`Unexpected schema catalog file: ${relativePath}`);
    }
  }

  const jsonFiles = catalogFiles.filter(({ relativePath }) => relativePath.toLowerCase().endsWith(".json"));
  const unsupportedFiles = catalogFiles.filter(
    ({ relativePath }) => !relativePath.toLowerCase().endsWith(".json") && path.posix.basename(relativePath) !== ".gitkeep"
  );
  if (unsupportedFiles.length) {
    throw new Error(`Unsupported schema catalog file: ${unsupportedFiles[0].relativePath}`);
  }
  const jsonByPath = new Map(jsonFiles.map(({ filePath, relativePath }) => [relativePath, readJson(filePath, root)]));
  for (const [relativePath, document] of jsonByPath) {
    if (relativePath.startsWith("schemas/") && (!document || typeof document !== "object")) {
      throw new Error(`Schema document must contain an object or array: ${relativePath}`);
    }
  }

  const componentCatalog = jsonByPath.get("components_list/components_list.json");
  if (!componentCatalog || typeof componentCatalog !== "object" || Array.isArray(componentCatalog)) {
    throw new Error("components_list/components_list.json must contain an object");
  }
  const componentSchemaPaths = new Set();
  const relationshipsById = new Map();
  const relationshipsByLookupKey = new Map();
  const componentPlacementCount = collectComponentPlacements(
    componentCatalog.categories,
    jsonByPath,
    componentSchemaPaths,
    relationshipsById,
    relationshipsByLookupKey
  );
  const actionCount = validateCatalogDefinitions({
    jsonByPath,
    catalogPath: "action_list/base_actions.json",
    property: "actions",
    directory: "actions",
    kind: "action"
  });
  const conditionCount = validateCatalogDefinitions({
    jsonByPath,
    catalogPath: "condition_list/base_conditions.json",
    property: "conditions",
    directory: "conditions",
    kind: "condition"
  });
  const gpioCatalog = jsonByPath.get("gpio/gpio-map.json");
  if (
    !gpioCatalog
    || typeof gpioCatalog !== "object"
    || Array.isArray(gpioCatalog)
    || !gpioCatalog.sections
    || typeof gpioCatalog.sections !== "object"
    || Array.isArray(gpioCatalog.sections)
    || !Object.keys(gpioCatalog.sections).length
  ) {
    throw new Error("gpio/gpio-map.json must contain a non-empty sections object");
  }
  for (const [sectionId, section] of Object.entries(gpioCatalog.sections)) {
    if (!section || typeof section !== "object" || Array.isArray(section) || !Array.isArray(section.rows)) {
      throw new Error(`gpio section '${sectionId}' must contain a rows array`);
    }
    if (section.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new Error(`gpio section '${sectionId}' rows must contain objects`);
    }
  }

  const actualGeneralSchemas = new Set(
    [...jsonByPath.keys()].filter((relativePath) => relativePath.startsWith("schemas/general/"))
  );
  for (const requiredPath of REQUIRED_GENERAL_SCHEMAS) {
    if (!actualGeneralSchemas.has(requiredPath)) {
      throw new Error(`missing required general schema: ${requiredPath}`);
    }
  }
  for (const actualPath of actualGeneralSchemas) {
    if (!REQUIRED_GENERAL_SCHEMAS.has(actualPath)) {
      throw new Error(`unowned general schema: ${actualPath}`);
    }
  }

  const nonHelperComponentSchemas = [...jsonByPath.keys()].filter(
    (relativePath) => relativePath.startsWith("schemas/components/")
      && !relativePath.startsWith("schemas/components/base_component/")
  );
  for (const schemaPath of nonHelperComponentSchemas) {
    if (!componentSchemaPaths.has(schemaPath)) {
      throw new Error(`unowned component schema: ${schemaPath}`);
    }
  }

  const rootHelperReferences = new Set();
  const helperGraph = new Map();
  const ownedReferenceDocuments = new Set([
    ...componentSchemaPaths,
    ...actualGeneralSchemas,
    ...[...jsonByPath.keys()].filter(
      (relativePath) => relativePath.startsWith("actions/") || relativePath.startsWith("conditions/")
    )
  ]);
  for (const [relativePath, document] of jsonByPath) {
    const helperReferences = new Set();
    visitSchemaReferences(document, relativePath, jsonByPath, helperReferences);
    if (relativePath.startsWith("schemas/components/base_component/")) {
      helperGraph.set(relativePath, helperReferences);
    } else if (ownedReferenceDocuments.has(relativePath)) {
      helperReferences.forEach((reference) => rootHelperReferences.add(reference));
    }
  }
  const helperSchemas = [...jsonByPath.keys()].filter(
    (relativePath) => relativePath.startsWith("schemas/components/base_component/")
  );
  const reachableHelpers = new Set();
  const visitingHelpers = new Set();
  const visitHelper = (helperPath) => {
    if (visitingHelpers.has(helperPath)) {
      throw new Error(`component helper extends cycle: ${helperPath}`);
    }
    if (reachableHelpers.has(helperPath)) return;
    visitingHelpers.add(helperPath);
    for (const reference of helperGraph.get(helperPath) || []) {
      visitHelper(reference);
    }
    visitingHelpers.delete(helperPath);
    reachableHelpers.add(helperPath);
  };
  rootHelperReferences.forEach(visitHelper);
  for (const helperPath of helperSchemas) {
    if (!reachableHelpers.has(helperPath)) {
      throw new Error(`unowned component helper schema: ${helperPath}`);
    }
  }

  return {
    fileCount: catalogFiles.length,
    jsonFileCount: jsonFiles.length,
    componentPlacementCount,
    actionCount,
    conditionCount
  };
};

export const verifyCatalogProjection = (catalogRoot, projectionRoot) => {
  const sourceRoot = path.resolve(catalogRoot);
  const outputRoot = path.resolve(projectionRoot);
  requireDirectoryRoot(sourceRoot, "Schema catalog source root");
  requireDirectoryRoot(outputRoot, "Schema catalog projection root");
  const sourceFiles = listFiles(sourceRoot);
  const sourceRelativePaths = new Set(
    sourceFiles.map((sourcePath) => toPosixPath(path.relative(sourceRoot, sourcePath)))
  );
  for (const sourcePath of sourceFiles) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const outputPath = path.join(outputRoot, relativePath);
    if (!fs.statSync(outputPath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`missing projection file: ${toPosixPath(relativePath)}`);
    }
    if (!fs.readFileSync(sourcePath).equals(fs.readFileSync(outputPath))) {
      throw new Error(`projection differs: ${toPosixPath(relativePath)}`);
    }
  }
  const staleProjection = listFiles(outputRoot)
    .map((outputPath) => toPosixPath(path.relative(outputRoot, outputPath)))
    .find((relativePath) => {
      const topLevel = relativePath.split("/", 1)[0];
      const isCatalogDirectory = CATALOG_DIRECTORIES.some(
        (directory) => directory.toLowerCase() === topLevel.toLowerCase()
      );
      return (isCatalogDirectory && !sourceRelativePaths.has(relativePath))
        || relativePath.toLowerCase().split("/").includes("schema-catalog");
    });
  if (staleProjection) {
    throw new Error(`stale projection file: ${staleProjection}`);
  }
  const nestedCatalogDirectory = listDirectories(outputRoot)
    .map((directoryPath) => toPosixPath(path.relative(outputRoot, directoryPath)))
    .find((relativePath) => relativePath.toLowerCase().split("/").includes("schema-catalog"));
  if (nestedCatalogDirectory) {
    throw new Error(`nested schema-catalog directory: ${nestedCatalogDirectory}`);
  }
  return { checkedFileCount: sourceFiles.length };
};

const catalogManifestEntries = (catalogRoot) => {
  const root = path.resolve(catalogRoot);
  requireDirectoryRoot(root, "Schema catalog manifest root");
  return listFiles(root).map((filePath) => ({
    path: toPosixPath(path.relative(root, filePath)),
    sha256: createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
  }));
};

export const writeCatalogManifest = (catalogRoot, manifestPath) => {
  const files = catalogManifestEntries(catalogRoot);
  const manifest = {
    schemaVersion: 1,
    kind: "ecd-schema-catalog",
    fileCount: files.length,
    files
  };
  fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
  fs.writeFileSync(path.resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
};

export const verifyCatalogManifest = (catalogRoot, manifestPath) => {
  const manifest = readJson(path.resolve(manifestPath), path.dirname(path.resolve(manifestPath)));
  if (
    !manifest
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || manifest.schemaVersion !== 1
    || manifest.kind !== "ecd-schema-catalog"
    || !Array.isArray(manifest.files)
    || manifest.fileCount !== manifest.files.length
  ) {
    throw new Error("Invalid schema catalog manifest");
  }
  const expected = catalogManifestEntries(catalogRoot);
  if (JSON.stringify(manifest.files) !== JSON.stringify(expected)) {
    throw new Error("Schema catalog manifest differs from the catalog tree");
  }
  return { checkedFileCount: expected.length };
};

const parseCli = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--root", "--projection", "--manifest", "--write-manifest"].includes(argument)) {
      throw new Error("Usage: node schema-catalog-contract.mjs [--root <path>] [--projection <path>] [--manifest <path> | --write-manifest <path>]");
    }
    if (!argv[index + 1]) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (options.manifest && options["write-manifest"]) {
    throw new Error("--manifest and --write-manifest cannot be used together");
  }
  return options;
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const options = parseCli(process.argv.slice(2));
    const defaultRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema-catalog");
    const root = options.root || defaultRoot;
    const summary = validateSchemaCatalog(root);
    if (options.projection) {
      const projection = verifyCatalogProjection(root, options.projection);
      console.log(`Schema catalog projection is current (${projection.checkedFileCount} files).`);
    }
    if (options["write-manifest"]) {
      const manifest = writeCatalogManifest(root, options["write-manifest"]);
      console.log(`Schema catalog manifest written (${manifest.fileCount} files).`);
    }
    if (options.manifest) {
      const manifest = verifyCatalogManifest(root, options.manifest);
      console.log(`Schema catalog manifest is current (${manifest.checkedFileCount} files).`);
    }
    console.log(
      `Schema catalog is valid (${summary.fileCount} files, ${summary.componentPlacementCount} component placements, ${summary.actionCount} actions, ${summary.conditionCount} conditions).`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
