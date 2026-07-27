# Scripts

These are development-time maintenance tools. The built frontend does not run
them.

## Local development launcher

`npm run dev` starts both Vite and the shared Python backend. Both processes use
one project store. If `esp-config-designer-frontend/runtime/` exists, the
launcher preserves that legacy runtime; otherwise it uses `runtime/` under the
new frontend root.

The launcher uses the prepared `%LOCALAPPDATA%/ECD/runtime/python.exe` on
Windows when available. These environment variables override its defaults:

- `ECD_DEV_RUNTIME_ROOT` selects a different runtime root;
- `ECD_DEV_BACKEND_PYTHON` selects the Python executable;
- `ECD_DEV_ESPHOME_BIN` selects the ESPHome command;
- `ECD_DEV_PROXY_TARGET` selects a local HTTP backend address and port.

Remote or HTTPS proxy targets are rejected because this command owns and starts
the development backend. Use `npm run serve` when only the Vite server is
required.

## Action definition generator

The action generator has three inputs and outputs with distinct ownership:

- `../shared/schema-catalog/action_list/base_actions.json` is the source of truth for catalog
  membership, action IDs, metadata, and each action's `schemaUrl`.
- `scripts/action-definition-generator.js` is the source of truth for generated
  field schemas. It contains exact definitions, reusable family rules, and the
  target-only fallback.
- `../shared/schema-catalog/actions/**/*.json` is the checked-in generated tree consumed by the
  frontend. Do not make durable edits there; move corrections into the generator.

The generator rejects empty catalogs, duplicate action IDs, any `schemaUrl` that
does not match the path derived from its ID, schema path collisions, and invalid
generated definition structures before checking or writing files.

### Check

Run the non-writing consistency check from the frontend root:

```bash
node scripts/generate-action-definitions.js --check
```

The command calculates the complete expected tree in memory and compares it to
`../shared/schema-catalog/actions/`. It reports sorted `missing`, `changed`, noncanonical `case`,
and `stale` JSON paths, exits nonzero on drift, and never creates, changes, or
removes files.

Use this command in review and CI to prove the checked-in artifacts match the
catalog and generator.

### Generate

Synchronize the generated tree from the frontend root:

```bash
npm run generate:actions
```

The equivalent direct command is:

```bash
node scripts/generate-action-definitions.js
```

The CLI resolves the canonical catalog relative to its own module. Tests and
specialized tooling can set `ECD_SCHEMA_CATALOG_ROOT` to an explicit fixture;
normal source generation must not override it.

Plain generation is non-destructive with respect to stale files. After validating
the catalog and all generated definitions, it:

- creates or overwrites every catalog action under `../shared/schema-catalog/actions/`;
- restores canonical directory and file-name casing without deleting the output
  on case-insensitive Windows filesystems;
- retains stale JSON files that are not represented by the catalog;
- reports retained stale paths, exits nonzero, and instructs you to review and
  prune them explicitly;
- leaves non-JSON files alone.

After reviewing catalog removals, explicitly synchronize stale files with:

```bash
node scripts/generate-action-definitions.js --prune
```

`--prune` is destructive: it writes all expected definitions and then removes
stale JSON files. Empty catalogs are rejected even with `--prune`, but always
review the reported stale paths before using it.

Any manual change made only in `../shared/schema-catalog/actions/` will be overwritten. For a
one-off or structurally complex action, update an exact definition in
`action-definition-generator.js`. For a repeated pattern, update the shared
family rule instead.

### Verify and deploy

After changing the catalog or generator, run:

```bash
node --test tests/actionDefinitionGenerator.test.mjs
node scripts/generate-action-definitions.js --check
npm run build
```

The tests and check cover the canonical `../shared/schema-catalog/actions/`
tree. `npm run build` validates and projects the complete canonical catalog into
`dist/`. The Home Assistant and standalone Docker
builds run the same frontend build and copy its output into the image
automatically. Do not copy the source action tree directly into `/web` because that
bypasses the normal frontend build output.
