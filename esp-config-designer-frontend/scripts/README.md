# Scripts

These are development-time maintenance tools. The built frontend does not run
them.

## Action definition generator

The action generator has three inputs and outputs with distinct ownership:

- `public/action_list/base_actions.json` is the source of truth for catalog
  membership, action IDs, metadata, and each action's `schemaUrl`.
- `scripts/action-definition-generator.js` is the source of truth for generated
  field schemas. It contains exact definitions, reusable family rules, and the
  target-only fallback.
- `public/actions/**/*.json` is the checked-in generated tree consumed by the
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
`public/actions/`. It reports sorted `missing`, `changed`, noncanonical `case`,
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

Plain generation is non-destructive with respect to stale files. After validating
the catalog and all generated definitions, it:

- creates or overwrites every catalog action under `public/actions/`;
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

Any manual change made only in `public/actions/` will be overwritten. For a
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

The tests and check cover the source `public/actions/` tree. `npm run build`
copies public assets into `dist/`; it does not update the Home Assistant add-on's
checked-in web bundle. To deploy the frontend to the add-on, copy the completed
`esp-config-designer-frontend/dist/*` build into `esp-config-designer/web/`, then
rebuild or restart the add-on. Do not copy `public/actions/` directly into the web
bundle because that bypasses the normal frontend build output.
