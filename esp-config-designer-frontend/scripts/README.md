# Scripts

## build-esphome-catalog.js
Generates `src/data/esphome-components.json` by parsing the ESPHome docs index.

### Usage
Run from the project root:

```bash
node scripts/build-esphome-catalog.js
```

This will:
- Download `content/components/_index.md` from `esphome-docs`.
- Parse categories, subcategories, and component links.
- Write the catalog to `src/data/esphome-components.json`.

### Optional comparison with ESPHome core
If you have a local clone of the ESPHome repo, you can compare the docs index
against the core component list:

```bash
node scripts/build-esphome-catalog.js --esphome-path "C:\\path\\to\\esphome"
```

This adds:
- `coreComponentIds` (components discovered in the core repo).
- `diff.missingFromDocs` (in core but not in docs index).
- `diff.missingFromCore` (in docs index but not in core).

### Optional local docs file
You can also point the script at a local copy of the docs index:

```bash
node scripts/build-esphome-catalog.js --docs-path "C:\\path\\to\\_index.md"
```

### Notes
- Updates are manual by design. Re-run the script whenever you want to refresh the catalog.
- The docs index can list the same component in multiple categories. The catalog
  de-duplicates these in `flatComponentIds`.
