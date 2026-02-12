import fs from "fs";
import path from "path";
import https from "https";

const docsUrl =
  "https://raw.githubusercontent.com/esphome/esphome-docs/current/content/components/_index.md";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
};

const docsPath = getArg("--docs-path");
const esphomePath = getArg("--esphome-path");

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseTableLine = (line) => {
  const matches = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  if (matches.length < 2) return null;
  const [name, rawPath] = matches;
  if (!rawPath.startsWith("components/")) return null;
  const cleanedPath = rawPath.replace(/\/$/, "");
  const id = cleanedPath.replace(/^components\//, "").replace(/\/index$/, "");
  return {
    name,
    path: cleanedPath,
    id
  };
};

const parseDocs = (markdown) => {
  const lines = markdown.split(/\r?\n/);
  const categories = [];
  let currentCategory = null;
  let currentSubcategory = null;
  let inTable = false;

  const ensureCategory = (title) => {
    currentCategory = {
      title,
      slug: slugify(title),
      items: [],
      subcategories: []
    };
    categories.push(currentCategory);
    currentSubcategory = null;
  };

  const ensureSubcategory = (title) => {
    if (!currentCategory) return;
    currentSubcategory = {
      title,
      slug: slugify(title),
      items: []
    };
    currentCategory.subcategories.push(currentSubcategory);
  };

  lines.forEach((line) => {
    if (line.startsWith("## ")) {
      ensureCategory(line.slice(3).trim());
      return;
    }
    if (line.startsWith("### ")) {
      ensureSubcategory(line.slice(4).trim());
      return;
    }
    if (line.startsWith("{{< imgtable >}}")) {
      inTable = true;
      return;
    }
    if (line.startsWith("{{< /imgtable >}}")) {
      inTable = false;
      return;
    }
    if (!inTable || !line.trim()) return;

    const item = parseTableLine(line);
    if (!item || !currentCategory) return;

    if (currentSubcategory) {
      currentSubcategory.items.push(item);
    } else {
      currentCategory.items.push(item);
    }
  });

  return categories.filter((category) =>
    category.items.length > 0 || category.subcategories.length > 0
  );
};

const flattenItems = (categories) => {
  const ids = new Set();
  categories.forEach((category) => {
    category.items.forEach((item) => ids.add(item.id));
    category.subcategories.forEach((subcategory) => {
      subcategory.items.forEach((item) => ids.add(item.id));
    });
  });
  return Array.from(ids).sort();
};

const collectCoreComponents = (rootPath) => {
  const componentsRoot = path.join(rootPath, "esphome", "components");
  if (!fs.existsSync(componentsRoot)) {
    return [];
  }
  const topLevel = fs
    .readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_"));

  const ids = new Set();
  topLevel.forEach((name) => {
    ids.add(name);
    const subdir = path.join(componentsRoot, name);
    fs.readdirSync(subdir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((child) => !child.startsWith(".") && !child.startsWith("_"))
      .forEach((child) => {
        ids.add(`${name}/${child}`);
      });
  });

  return Array.from(ids).sort();
};

const buildCatalog = async () => {
  const markdown = docsPath
    ? fs.readFileSync(docsPath, "utf8")
    : await fetchText(docsUrl);
  const categories = parseDocs(markdown);
  const items = flattenItems(categories);
  const coreComponents = esphomePath ? collectCoreComponents(esphomePath) : [];

  const missingFromDocs = coreComponents.length
    ? coreComponents.filter((id) => !items.includes(id))
    : [];
  const missingFromCore = coreComponents.length
    ? items.filter((id) => !coreComponents.includes(id))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      docsIndex: docsPath ?? docsUrl,
      esphomeRepo: esphomePath ?? null
    },
    notes: [
      "Items are grouped exactly as in ESPHome docs.",
      "Components can appear in multiple categories in docs; flat list de-duplicates by id."
    ],
    categories,
    flatComponentIds: items,
    coreComponentIds: coreComponents,
    diff: {
      missingFromDocs,
      missingFromCore
    }
  };
};

const outputPath = path.resolve(
  process.cwd(),
  "src",
  "data",
  "esphome-components.json"
);

const run = async () => {
  const catalog = await buildCatalog();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
