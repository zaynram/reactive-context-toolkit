# Migrating DAISY to RCT v1.0.0

**Date:** 2026-04-02
**From:** `github:zaynram/reactive-context-toolkit` (pre-v1.0.0, commit-pinned)
**To:** `github:zaynram/reactive-context-toolkit` (v1.0.0 tag)

## Overview

DAISY currently uses RCT via a commit-pinned GitHub dependency. The v1.0.0 release introduces breaking changes to plugin names and the `definePlugin` API. This guide covers the migration steps.

## Breaking Changes Affecting DAISY

### 1. Plugin names changed to full package names

**Before:** `globals.plugins: ['track-work', 'issue-scope']`
**After:** `globals.plugins: ['rct-plugin-track-work', 'rct-plugin-issue-scope']`

DAISY's `rct.config.json` does not currently use builtin plugins (it declares files directly), so this change has **no impact** unless plugins are adopted.

### 2. `definePlugin` signature changed

**Before:** `definePlugin(config, setupFn)` — two arguments
**After:** `definePlugin({ ...config, setup() { ... } })` — single argument with setup as property

DAISY does not define custom plugins, so this has **no impact**.

### 3. `applyPlugins` return type changed

**Before:** Returns `ValidatedConfig`
**After:** Returns `{ config: ValidatedConfig, extensions: PluginExtensions }`

DAISY does not call `applyPlugins` directly (it uses the CLI), so this has **no impact**.

## Migration Steps

### Step 1: Update the dependency

In `package.json`:

```json
"dependencies": {
    "reactive-context-toolkit": "github:zaynram/reactive-context-toolkit#v1.0.0"
}
```

Then:

```sh
bun install
```

### Step 2: Update `.claude/settings.json` hook command

**Current:** `bun run node_modules/reactive-context-toolkit/src/hook.ts SessionStart`
**Recommended:** `bun run node_modules/.bin/rct hook SessionStart` (uses the bin entry)

Or keep the current path — Bun resolves TypeScript directly, so the old path still works.

### Step 3: Adopt builtin plugins (recommended)

DAISY's `rct.config.json` manually declares the same files that `rct-plugin-track-work` and `rct-plugin-issue-scope` provide. Migrating to plugins reduces config duplication and adds setup scaffolding (auto-creates missing files from templates).

**Replace manual file declarations:**

```json
{
    "globals": {
        "format": "xml",
        "plugins": ["rct-plugin-track-work", "rct-plugin-issue-scope"]
    },
    "lang": { ... },
    "rules": [ ... ],
    "injections": [ ... ],
    "meta": {
        "injectOn": "SessionStart",
        "include": ["files", "rules", "plugins"],
        "brief": true
    }
}
```

**What this replaces:**

- Manual `chores` and `plans` file entries → provided by `rct-plugin-track-work`
- Manual `scope` and `issues` file entries → provided by `rct-plugin-issue-scope`
- The `meta` config adds self-briefing (tells Claude what RCT provides)

**What you keep:**

- Custom `rules` (planning convention block, known-bug marker warn)
- Custom `injections` (Notion context, entry schema on read)
- `lang` config (Python/pixi, Rust/cargo)
- Any files not covered by plugins (e.g., `notion-pages`, `notion-model`)

### Step 4: Adjust file paths

The builtin plugins use these paths:

- `rct-plugin-track-work`: `.claude/context/chores.xml`, `.claude/context/plans.xml`
- `rct-plugin-issue-scope`: `.claude/context/scope.xml`, `.claude/context/issues.xml`

DAISY currently uses:

- `dev/chores.xml`, `.claude/plans/index.xml` (track-work equivalent)
- `dev/scope.xml`, `dev/issues.xml` (issue-scope equivalent)

**Options:**

1. **Move files to match plugin paths** — rename `dev/chores.xml` → `.claude/context/chores.xml`, etc.
2. **Keep current paths, don't use plugins** — continue with manual file declarations
3. **Fork the plugins** — copy plugin source to `.claude/hooks/rct/` and customize paths

Option 1 is cleanest. Option 2 requires no changes. Option 3 is for maximum control.

### Step 5: Test

```sh
bun test  # verify RCT still works
```

Run a `SessionStart` hook manually to verify context injection:

```sh
echo '{}' | bun run node_modules/.bin/rct hook SessionStart
```

## Self-Briefing Experiment

After migration, add `meta` config to test the self-briefing hypothesis:

```json
"meta": {
    "injectOn": "SessionStart",
    "include": ["files", "rules", "plugins"],
    "brief": true
}
```

After 2+ work sessions, assess:

1. Does Claude reference RCT-managed files more reliably?
2. Do rule violations decrease?
3. Is the injected context useful or noise?

Results inform whether v1.1 features (Claude-facing config tools) are worth building.
