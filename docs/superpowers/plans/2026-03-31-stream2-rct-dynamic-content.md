# Implementation Plan: Stream 2 — rct Plugin Dynamic Content & Triggers Enhancement

**Spec:** `docs/superpowers/specs/2026-03-31-rct-plugin-tmux-design.md` (Stream 2 section)
**Branch:** `feat/plugin-dynamic-context`
**Issue:** #8
**Draft PR:** #9

## Prerequisites

- [x] Create feature branch `feat/plugin-dynamic-context` from `main`
- [x] Create GitHub issue for tracking
- [x] Create draft PR linked to issue

## Steps

### Step 1: Extend `RCTPlugin` interface

**Files to modify:**

- `src/plugin/types.ts` — add optional `context` and `trigger` functions to `RCTPlugin`

```typescript
import type { RCTConfig, HookEvent } from '#config/types'

/** Result from a plugin's dynamic trigger function. */
export interface PluginTriggerResult {
    action: 'block' | 'warn'
    message: string
}

/** Input passed to plugin context/trigger functions — matches what the hook pipeline actually has. */
export interface PluginHookInput {
    toolName?: string
    payload: Record<string, unknown>
}

export interface RCTPlugin extends Pick<RCTConfig, 'rules' | 'files'> {
    name: string
    context?: (
        event: HookEvent,
        input: PluginHookInput,
    ) => string | undefined | Promise<string | undefined>
    trigger?: (
        event: HookEvent,
        input: PluginHookInput,
    ) =>
        | PluginTriggerResult
        | undefined
        | Promise<PluginTriggerResult | undefined>
}
```

**Note:** We use `PluginHookInput` (not `RC.HookInput`) because the hook pipeline in `cli/hook.ts` never constructs an `RC.HookInput` object. It reads stdin into `Record<string, unknown>` and extracts `toolName`. `RC.HookInput` is only used by the imperative extension API (`createHook`, `standard`, `dynamic`, `block`), which is a separate code path.

**Files to create:**

- `test/plugin-dynamic.test.ts` — tests for both new capabilities

**Tests (write first — TDD):**

_context:_

- Plugin with `context` function is valid (type-checks)
- Plugin without `context` function still works (backwards compatible)
- `context` returning `undefined` produces no output
- `context` returning a string appends to additionalContext
- `context` that throws is caught and warned (not fatal)
- Async `context` functions are awaited
- `context` that exceeds timeout (5s) is treated as undefined with warning

_trigger:_

- Plugin with `trigger` function is valid
- Plugin without `trigger` function still works
- `trigger` returning `undefined` takes no action
- `trigger` returning `{ action: 'block', message }` blocks the tool use
- `trigger` returning `{ action: 'warn', message }` adds a warning
- `trigger` that throws is caught and warned (not fatal)
- Async `trigger` functions are awaited
- `trigger` that exceeds timeout (5s) is treated as undefined with warning
- `trigger` block takes precedence over static rule warn (highest severity wins)

### Step 2: Thread `context` and `trigger` through plugin resolution

**Files to modify:**

- `src/config/schema.ts` (`applyPlugins`) — preserve `context` and `trigger` functions from resolved plugins alongside files/rules

Currently `applyPlugins` merges `files[]` and `rules[]` into the config and returns the merged config. It needs to also collect `context` and `trigger` functions.

**Approach:** Return a `PluginExtensions` object alongside the merged config:

```typescript
export interface PluginExtensions {
    contexts: Array<{ name: string; fn: NonNullable<RCTPlugin['context']> }>
    triggers: Array<{ name: string; fn: NonNullable<RCTPlugin['trigger']> }>
}

// applyPlugins returns { config, extensions }
```

**Tests:**

- `applyPlugins` preserves `context` and `trigger` functions
- Multiple plugins with both functions all collected
- Plugin with only `context` or only `trigger` (no files/rules) works
- Plugin with none of the dynamic functions still works (backwards compat)
- Functions are paired with plugin names for error attribution

### Step 3: Integrate into hook pipeline

**Files to modify:**

- `src/cli/hook.ts` — call plugin `context()` and `trigger()` functions during pipeline evaluation
- `src/engine/compose.ts` — add `pluginContextResults: string[]` field to `ComposeInput`, include in parts assembly after injections and before meta

**Integration points:**

_trigger:_ During or immediately after `evaluateRules()` phase. For each plugin with a `trigger` function, call it with `{ toolName, payload }` wrapped in `Promise.race` with 5s timeout. If it returns a block, exit with block decision. If it returns a warn, add to warnings. Severity ordering: block > warn > undefined.

_context:_ After `evaluateInjections()` and before `composeOutput()`. For each plugin with a `context` function, call it with `{ toolName, payload }` wrapped in `Promise.race` with 5s timeout. Collect non-undefined results into `pluginContextResults`.

**Timeout helper:**

```typescript
async function withTimeout<T>(
    fn: () => Promise<T>,
    ms: number,
    label: string,
): Promise<T | undefined> {
    try {
        return await Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${label} timed out after ${ms}ms`)),
                    ms,
                ),
            ),
        ])
    } catch (err) {
        console.warn(
            `[rct] Warning: ${label}: ${err instanceof Error ? err.message : err}`,
        )
        return undefined
    }
}
```

**Tests:**

- End-to-end hook test with plugin providing dynamic context
- End-to-end hook test with plugin providing dynamic trigger (block)
- End-to-end hook test with plugin providing dynamic trigger (warn)
- Plugin context/trigger errors are caught and logged, don't block pipeline
- Plugin trigger block overrides static rule warn
- Plugin outputs included in composed output via `pluginContextResults`
- Timeout test: context function that hangs is killed after 5s

### Step 4: Fix pre-existing issues

These touch the same files we're already modifying.

#### 4a: Plugin error visibility (`src/config/schema.ts:110-119`)

**Current:** `console.warn(`[rct] Failed to resolve plugin '${name}': ${...}`)`
**Fix:** Ensure consistent `[rct] Warning:` prefix. Check for `RCT_DEBUG` env var — if set, log full stack trace via `console.warn`.

**Test:** Verify warning format, verify debug mode shows stack trace.

#### 4b: Silent file reference failures (`src/engine/injections.ts:50-78`)

**Current:** `if (!resolved) continue` — no warning.
**Fix:** Add `console.warn(`[rct] Warning: FileRef '${ref}' did not resolve — skipping injection`)`.

**Test:** Verify warning emitted for unresolvable refs.

#### 4c: Unused `staleCheck.format` parameter

**Current:** `format?: string` exists as an inline property of `FileEntry.staleCheck` at `src/config/types.ts:75-81`. Also accepted in `applyStaleCheck` parameter type at `src/config/schema.ts:182`.
**Fix:** Remove `format` from both locations. Check if any test or config references it.

**Test:** Verify type no longer accepts `format`. Existing stale check tests still pass.

### Step 5: Update tests + documentation

- Run full `bun test` suite — ensure no regressions
- Update `CLAUDE.md` architecture section to mention plugin `context` and `trigger` capabilities
- Update plugin section with interface documentation
- Lint + format

## Build Sequence

```
Step 1 (interface + types) → Step 2 (resolution) → Step 3 (pipeline + compose.ts)
                                                  → Step 4 (pre-existing fixes, parallel with Step 3)
                                                  → Step 5 (tests + docs)
```

Steps 3 and 4 can run in parallel — they touch different files:

- Step 3: `hook.ts`, `compose.ts`
- Step 4: `schema.ts`, `injections.ts`, `config/types.ts`

## Touch Point with Stream 1

After this lands, a follow-up PR updates `rct-plugin-tmux/src/index.ts`:

```typescript
import type { RCTPlugin } from 'reactive-context-toolkit'
import { listPanes, formatLayoutSummary } from './lib/tmux'

export default {
    name: 'tmux',
    context: async (event) => {
        if (event !== 'SessionStart') return undefined
        try {
            return formatLayoutSummary(await listPanes())
        } catch {
            return undefined // tmux not available — no context
        }
    },
    trigger: async (event, input) => {
        // v2: warn if Bash command conflicts with a watched pane
        return undefined
    },
} satisfies RCTPlugin
```
