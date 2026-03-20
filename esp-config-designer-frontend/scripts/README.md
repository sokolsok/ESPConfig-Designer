# Scripts

Utilities in this folder are development-time maintenance tools. The built frontend
does not execute them at runtime.

Runtime uses the generated data files:
- `public/actions/**/*.json`
- `src/data/esphome-components.json`

Edit the scripts when you want to change how those files are produced.

## Action schema generator

Files:
- `scripts/action-definition-generator.js` -> source of truth for repetitive action schema rules
- `scripts/generate-action-definitions.js` -> CLI entrypoint

What it does:
- reads `public/action_list/base_actions.json`
- generates or updates every action schema under `public/actions/`
- removes stale generated files that no longer exist in the action catalog

Run from the frontend root:

```bash
npm run generate:actions
```

Equivalent direct command:

```bash
node scripts/generate-action-definitions.js
```

### When to use it

- after adding a new action to `public/action_list/base_actions.json`
- after changing a family rule in `scripts/action-definition-generator.js`
- after fixing a docs mismatch in a generated action schema
- after changing shared schema conventions that affect action fields

### How to modify action schemas safely

1. Decide whether the action is:
   - a one-off complex action -> add or update an explicit manual definition in `scripts/action-definition-generator.js`
   - part of a family (`set_*`, `publish`, `control`, `turn_on`, protocol families, etc.) -> extend the generator rule instead of editing one file
2. Run `npm run generate:actions`
3. Run verification:

```bash
node tests/actionDefinitionGenerator.test.mjs
npm run build
```

### Important rule

Do not hand-edit generated files in `public/actions/` unless you are intentionally
debugging output and plan to move the change back into the generator immediately.

Durable edit point:
- `scripts/action-definition-generator.js`

Generated artifact:
- `public/actions/**/*.json`

### Generator structure

The generator currently combines three strategies:

- **Manual overrides**
  - for complex, doc-driven actions such as control-flow or actions with nested payloads
- **Family heuristics**
  - for repetitive patterns like `set_*`, `*.publish`, `*.control`, `turn_on`, `turn_off`, protocol senders, etc.
- **Fallback**
  - minimal target-only schema when there is no stronger docs-backed rule yet

### Related schema contracts

The generated action JSON files still use the same shared renderer contracts as the
rest of the schema system. Examples that are safe to use in generated actions:

- `templatable`
- `lambdaPlaceholder`
- `note`
- `dependsOn`
- `emitYAML`
- `emitKey: "inline"`

## ESPHome component catalog builder

File:
- `scripts/build-esphome-catalog.js`

What it does:
- downloads or reads the ESPHome docs index
- parses categories, subcategories, and component links
- writes the normalized catalog to `src/data/esphome-components.json`

Run from the frontend root:

```bash
node scripts/build-esphome-catalog.js
```

### Optional comparison with ESPHome core

If you have a local ESPHome clone:

```bash
node scripts/build-esphome-catalog.js --esphome-path "C:\path\to\esphome"
```

This adds:
- `coreComponentIds`
- `diff.missingFromDocs`
- `diff.missingFromCore`

### Optional local docs file

```bash
node scripts/build-esphome-catalog.js --docs-path "C:\path\to\_index.md"
```

## Recommended maintenance workflow

For action work:

1. Update docs-backed rules in `scripts/action-definition-generator.js`
2. Run `npm run generate:actions`
3. Run `node tests/actionDefinitionGenerator.test.mjs`
4. Run `npm run build`
5. Spot-check a few affected actions in the Builder UI

For component-catalog work:

1. Run `node scripts/build-esphome-catalog.js`
2. Verify the generated `src/data/esphome-components.json`
3. Run `npm run build`

## Notes

- Script updates are manual by design.
- Re-run generators whenever you change their source-of-truth inputs.
- Prefer systemic rule changes over patching one generated JSON file at a time.
