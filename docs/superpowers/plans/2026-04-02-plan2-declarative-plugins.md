# Execution Plan 2: Declarative Plugin Packages

**Spec:** `docs/superpowers/specs/2026-04-02-v1.0.0-release-spec.md` (sections 4.1, 4.2)
**Phase:** 2A (parallel with Plans 3 and 4, after Plan 1 barrier)
**Isolation:** `worktree` — execute in isolated worktree, merge at Phase 2 barrier

## File Ownership (exclusive)

| File                                           | Action        |
| ---------------------------------------------- | ------------- |
| `plugins/rct-plugin-issue-scope/src/index.ts`  | Rewrite       |
| `plugins/rct-plugin-issue-scope/package.json`  | Review/modify |
| `plugins/rct-plugin-issue-scope/public/*`      | Review only   |
| `plugins/rct-plugin-issue-scope/tsconfig.json` | Review only   |
| `plugins/rct-plugin-track-work/src/index.ts`   | Rewrite       |
| `plugins/rct-plugin-track-work/package.json`   | Review/modify |
| `plugins/rct-plugin-track-work/public/*`       | Review only   |
| `plugins/rct-plugin-track-work/tsconfig.json`  | Review only   |

**No test files in `test/` directory.** These plugins are tested via the plugin registry in `test/plugin.test.ts` (owned by Plan 1). Plan 2 may add test files ONLY inside the plugin packages themselves (e.g., `plugins/rct-plugin-issue-scope/test/`).

## Prerequisites

- Plan 1 must be complete (Phase 1 barrier passed)
- Read the spec sections 4.1, 4.2
- Read current source files for both plugins
- Understand that `definePlugin` no longer accepts a second `setup` argument
- Understand that `setup` is now a property on the plugin object
- Understand the closure pattern (not `this`) for accessing files in setup

## Steps

### Step 1: Rewrite `plugins/rct-plugin-issue-scope/src/index.ts`

**Current state:** Uses `definePlugin(config, setupFn)` two-arg pattern. Setup accesses `plugin.files` (passed as argument). Crashes on null `metaFiles` and null `find()` result.

**Target state:** Uses `definePlugin({ ...config, setup() { ... } })` single-arg pattern. Setup closes over `files` array. Guards all optional access. Creates directories if needed.

Read the current file, then rewrite following the spec section 4.1 example exactly. Key points:

- Define `files` array as a `const` before `definePlugin` call
- Reference `files` directly in `setup()` (closure, not `this`)
- Guard `f.metaFiles?.find(...)` with optional chaining
- Guard `template` with `if (!template) continue`
- Create parent directory with `fs.mkdirSync(dir, { recursive: true })` before copying
- Keep all file definitions (aliases, paths, metaFiles, staleCheck) unchanged

**Path resolution note:** `definePlugin` mutates `files[].path` in-place (via `plugin.files = plugin.files.map(...)` which reassigns the array). Since setup closes over the `files` const defined before `definePlugin`, setup sees the **original relative paths** (e.g., `.claude/context/scope.xml`), not resolved absolute paths. This is correct because:

- `setup` runs inside `applyPlugins`, which runs during hook execution
- At hook execution time, `process.cwd()` is the consumer's project directory
- `fs.existsSync('.claude/context/scope.xml')` resolves against cwd, which IS the project dir
- Template paths (via `asset()`) use `__dirname` and are always absolute

**Verify:** The `path` values for templates (`scopeFiles`, `issuesFiles`) use `__dirname` via the `asset()` helper. These are already absolute.

### Step 2: Rewrite `plugins/rct-plugin-track-work/src/index.ts`

**Current state:** Same two-arg pattern. Crashes on unknown alias via unsafe `as keyof typeof templates` cast.

**Target state:** Same closure pattern. Guards the templates lookup.

Read the current file, then rewrite following the spec section 4.2 example exactly. Key points:

- Define `files` array as a `const` before `definePlugin` call
- Reference `files` directly in `setup()` (closure)
- Guard `if (!(key in templates)) continue`
- Create parent directory before copying
- Keep all file definitions unchanged

### Step 3: Review package.json files

For both plugins, verify:

- `name` matches what's in `BUILTIN_PLUGINS` constant (`rct-plugin-issue-scope`, `rct-plugin-track-work`)
- `version` is `0.1.0` (workspace package, not independently versioned)
- `type` is `module`
- Dependencies: only `reactive-context-toolkit` as peer or optional dependency
- No missing dependencies (both use `fs`, `path` from Node builtins)

### Step 4: Add setup tests (optional, within plugin packages)

If time permits, create minimal test files:

**`plugins/rct-plugin-issue-scope/test/setup.test.ts`:**

```typescript
import { describe, test, expect } from 'bun:test'
import { mkdtempSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('issue-scope setup', () => {
    test('scaffolds missing files from templates', () => {
        // Create temp dir, set process.cwd to it
        // Import the plugin, call setup()
        // Verify .claude/context/scope.xml and issues.xml created
    })

    test('skips existing files', () => {
        // Create temp dir with existing files
        // Call setup()
        // Verify files not overwritten
    })
})
```

**Note:** These tests require careful working directory management. If complex, skip and rely on the integration tests in `test/plugin.test.ts` (Plan 1) and `test/hook-plugin.test.ts` (Plan 4).

### Step 5: Verify integration

Run only the relevant tests to verify:

```sh
bun test test/plugin.test.ts
bun test test/schema.test.ts
```

The plugin registry tests (Plan 1) should still pass with the rewritten plugins. Also verify that `test/schema.test.ts` includes a test asserting `applyPlugins` calls `setup()`. If no such test exists, flag this at the barrier — it means Plan 1 did not add setup invocation coverage.

### Step 6: Run full test suite

```sh
bun test
```

All tests must pass.

## Success Criteria

- [ ] `plugins/rct-plugin-issue-scope/src/index.ts` uses single-arg `definePlugin` with `setup` property
- [ ] `plugins/rct-plugin-issue-scope/src/index.ts` uses closure pattern (not `this`)
- [ ] `plugins/rct-plugin-issue-scope/src/index.ts` guards null `metaFiles` and null `find()` result
- [ ] `plugins/rct-plugin-issue-scope/src/index.ts` creates directories before copying
- [ ] `plugins/rct-plugin-track-work/src/index.ts` uses same pattern
- [ ] `plugins/rct-plugin-track-work/src/index.ts` guards unknown alias lookup
- [ ] All tests pass
- [ ] No files outside ownership list modified

## Barrier: Phase 2 → Phase 3

After this plan completes:

1. Commit all changes in worktree
2. Report: files changed, tests passing
3. Wait for Plans 3 and 4 to complete
4. Merge all worktrees at Phase 2 barrier
