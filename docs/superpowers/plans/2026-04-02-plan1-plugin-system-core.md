# Execution Plan 1: Plugin System Core

**Spec:** `docs/superpowers/specs/2026-04-02-v1.0.0-release-spec.md`
**Phase:** 1 (solo — must complete before Phase 2 fan-out)
**Branch:** `feat/rct-plugin-tmux` (work directly on branch, no worktree)

## File Ownership (exclusive — no other plan may touch these)

| File                          | Action                                   |
| ----------------------------- | ---------------------------------------- |
| `src/plugin/types.ts`         | Modify                                   |
| `src/plugin/validate.ts`      | Modify                                   |
| `src/plugin/index.ts`         | Modify                                   |
| `src/plugin/resolve.ts`       | Modify                                   |
| `src/lib/plugin.ts`           | Modify                                   |
| `src/config/schema.ts`        | Modify                                   |
| `src/constants.ts`            | Review only                              |
| `src/index.ts`                | Modify                                   |
| `src/plugin/issueScope.ts`    | Verify deleted (should not exist)        |
| `src/plugin/trackWork.ts`     | Verify deleted (should not exist)        |
| `test/lib-plugin.test.ts`     | Modify                                   |
| `test/plugin-resolve.test.ts` | Modify                                   |
| `test/plugin.test.ts`         | Modify                                   |
| `test/plugin-tmux.test.ts`    | Modify                                   |
| `test/schema.test.ts`         | Modify                                   |
| `test/exports.test.ts`        | Modify                                   |
| `test/config.test.ts`         | Review/modify if types change            |
| `test/init.test.ts`           | Review/modify if discoverPlugins changes |

## Prerequisites

- Read the spec (sections 2, 3.1–3.7)
- Read all files listed above to understand current state
- Run `bun test` to confirm baseline (356 pass, 0 fail)

## Steps

### Step 1: Modify `src/plugin/types.ts`

**Current state:** `RCTPlugin` interface has required `name: string`. No `setup` property.

**Changes:**

1. Make `name` optional: `name?: string`
2. Add `setup?: () => void | Promise<void>` to the interface
3. Add `displayName` utility function:
    ```typescript
    export function displayName(plugin: RCTPlugin, ref: string): string {
        const raw = plugin.name ?? ref
        return raw.replace(/^rct-plugin-/, '')
    }
    ```
4. Keep all other types unchanged (PluginTriggerResult, PluginHookInput, BuiltinPluginRef, etc.)

**Verify:** `BuiltinPluginRef` type still derives correctly from `BUILTIN_PLUGINS` const.

### Step 2: Modify `src/plugin/validate.ts`

**Current state:** Only checks `'name' in plugin`. 7 lines.

**Replace the `validatePlugin` function body** with the full implementation from spec section 3.3. This validates all optional property types (name=string, files=array, rules=array, context=function, trigger=function, setup=function). Does NOT require `name`.

**Keep** `PluginValidationError` class unchanged.

### Step 3: Modify `src/plugin/index.ts`

**Current state:** Keys registry by `x.value.name` (plugin's exported name). Has `todo: wire in` comment at line 17. Uses filter-then-map which would corrupt indices if a plugin fails to load.

**Changes:**

1. Remove `todo: wire in` comment
2. Replace the registry construction to pair results with names BEFORE filtering:
    ```typescript
    export default Object.fromEntries(
        results
            .map((r, i) => [BUILTIN_PLUGINS[i], r] as const)
            .filter(([, r]) => r.status === 'fulfilled')
            .map(([name, r]) => [
                name,
                {
                    plugin: (r as PromiseFulfilledResult<RCTPlugin>).value,
                    ref: name,
                    source: 'builtin',
                } as InstalledBuiltinPlugin,
            ]),
    ) as BuiltinPlugins
    ```
3. Fix the `Promise.allSettled` callback — the current code has a nested `Promise.resolve`/`Promise.reject` pattern that's unnecessarily complex. Simplify:
    ```typescript
    const results = await Promise.allSettled(
        BUILTIN_PLUGINS.map(async (name) => {
            const { default: plugin } = await import(name)
            validatePlugin(plugin, name)
            return plugin
        }),
    )
    ```
    The `try/catch` inside the `.map` callback is redundant — `Promise.allSettled` already catches rejections.

### Step 4: Modify `src/plugin/resolve.ts`

**Current state:** Imports `builtins` from `./index` and checks `ref in builtins`.

**Changes:** No structural changes needed — the `ref in builtins` check will now work correctly because the registry is keyed by package name (matching what consumers write in config). Do NOT import `displayName` here (it's used in `schema.ts`, not `resolve.ts`).

**Verify:** The resolution chain (builtin → local → package) still works. Test with:

- `rct-plugin-track-work` (builtin)
- `./plugins/my-plugin.ts` (local)
- `some-npm-package` (package)

### Step 5: Modify `src/lib/plugin.ts`

**Current state:** Accepts `(plugin, setup?)`, calls `setup(plugin)` synchronously, only resolves top-level `files[].path`.

**Changes:**

1. Remove the `setup` parameter entirely
2. Add metaFile path resolution:
    ```typescript
    export function definePlugin(plugin: RCTPlugin): RCTPlugin {
        if (plugin.files) {
            plugin.files = plugin.files.map((f) => ({
                ...f,
                path:
                    path.isAbsolute(f.path) ?
                        f.path
                    :   path.resolve(process.cwd(), f.path),
                metaFiles: f.metaFiles?.map((mf) => ({
                    ...mf,
                    path:
                        path.isAbsolute(mf.path) ?
                            mf.path
                        :   path.resolve(process.cwd(), mf.path),
                })),
            }))
        }
        return plugin
    }
    ```
3. No `setup` call. No side effects.

**Important note on intermediate state:** After this change, existing plugin callers in `plugins/*/src/index.ts` still pass a second argument to `definePlugin(config, setupFn)`. This is safe at runtime — JavaScript ignores extra positional arguments. Phase 2 Team A (Plan 2) will migrate these callers to use `RCTPlugin.setup` as a property. Do NOT modify files under `plugins/`.

**Note:** `process.cwd()` is correct here — plugin file paths like `.claude/context/scope.xml` are relative to the consumer's project. Plugin-internal asset paths (templates) are already absolute via `__dirname`/`import.meta.dir`.

### Step 6: Modify `src/config/schema.ts`

**Current state:** `applyPlugins` returns `{ config, extensions }`. Uses `plugin.name ?? name` for extension naming.

**Changes:**

1. Import `displayName` from `#plugin/types`
2. Replace `plugin.name ?? name` with `displayName(plugin, name)` in extension registration (lines ~129, ~134)
3. Add setup call inside the existing `try/catch` block, after the trigger registration (after current line ~136), before the closing `} catch`. This is the last step inside the `for (const name of pluginNames)` try block:
    ```typescript
    if (plugin.setup) {
        try {
            await Promise.resolve(plugin.setup())
        } catch (err) {
            console.warn(
                `[rct] Warning: plugin '${displayName(plugin, name)}' setup failed: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }
    ```

### Step 7: Modify `src/index.ts`

**Current state:** Exports `RCTPlugin`, `PluginHookInput`, `PluginTriggerResult` from plugin types.

**Changes:**

1. Add `displayName` to the plugin type exports
2. Verify `definePlugin` export still works with new signature (no second param)
3. Verify `PluginExtensions` and `ApplyPluginsResult` types are exported

### Step 8: Update tests

#### `test/lib-plugin.test.ts`

- Remove any tests that pass a `setup` second argument to `definePlugin`
- Add test: `definePlugin accepts single argument` — verify `definePlugin.length === 1` (runtime arity check)
- Add test: `definePlugin resolves metaFile paths` — verify metaFiles get absolute paths
- Keep existing path resolution tests

#### `test/plugin-resolve.test.ts`

- Update expected `ref` values to match package names (e.g., `rct-plugin-track-work`)
- Add test: `displayName strips rct-plugin- prefix`
- Add test: `displayName uses plugin.name when present`
- Add test: `displayName falls back to ref when name absent`
- Add test: `validatePlugin accepts plugin with no properties` — verify `validatePlugin({}, 'test-ref')` does NOT throw (load-bearing: name is now optional)

#### `test/plugin.test.ts`

- Update to test registry is keyed by package name (`rct-plugin-track-work`, not `track-work`)
- Verify all 3 builtins present: `rct-plugin-tmux`, `rct-plugin-track-work`, `rct-plugin-issue-scope`

#### `test/plugin-tmux.test.ts`

- Update name assertion (plugin name is `rct-plugin-tmux`)
- Verify it's a minimal plugin (no files, no rules, no context, no trigger)

#### `test/schema.test.ts`

- Add test: `applyPlugins calls plugin.setup()` — plugin with setup function, verify it's called
- Add test: `applyPlugins isolates setup errors` — plugin with throwing setup, verify warning logged, pipeline continues
- Update existing `applyPlugins` tests to use full package names in `globals.plugins`
- Add test: `applyPlugins uses displayName for extension naming`

#### `test/exports.test.ts`

- Add `displayName` to expected exports
- Verify `definePlugin` signature (single argument)

#### `test/config.test.ts`

- If `RCTPlugin` type changed (name optional), verify compile-time type tests still pass

#### `test/init.test.ts`

- Verify `discoverPlugins` test expectations match new registry keying

### Step 9: Run full test suite

```sh
bun test
```

All tests must pass. If any fail, fix before proceeding. Do not proceed to Phase 2 with failing tests.

### Step 10: Verify no file ownership violations

Confirm no files outside the ownership list were modified. Run:

```sh
git diff --name-only
```

All changed files must be in the ownership table above.

## Success Criteria

- [ ] `RCTPlugin.name` is optional
- [ ] `RCTPlugin.setup` exists on the interface
- [ ] `definePlugin` is pure (no setup call, no side effects)
- [ ] `definePlugin` resolves metaFile paths
- [ ] `validatePlugin` checks all optional property types
- [ ] Registry keyed by BUILTIN_PLUGINS package name
- [ ] `displayName` utility works correctly
- [ ] `applyPlugins` calls setup with error isolation
- [ ] All tests pass (target: 356+ tests)
- [ ] No files outside ownership list modified

## Barrier: Phase 1 → Phase 2

After this plan completes:

1. Commit all changes with descriptive message
2. Run `bun test` one final time
3. Report: number of tests passing, any warnings
4. The public API barrel (`src/index.ts`) is now FROZEN — Phase 2 teams must not modify it
