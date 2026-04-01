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
import type { RCTConfig, HookEvent, RuleAction } from '#config/types'

export interface PluginTriggerResult {
    action: RuleAction
    message: string
}

export interface RCTPlugin extends Pick<RCTConfig, 'rules' | 'files'> {
    name: string
    context?: (event: HookEvent, input: RC.HookInput) => string | Promise<string> | undefined
    trigger?: (event: HookEvent, input: RC.HookInput) => PluginTriggerResult | Promise<PluginTriggerResult> | undefined
}
```

**Files to create:**
- `test/plugin-dynamic.test.ts` — tests for both new capabilities

**Tests (write first — TDD):**

*context:*
- Plugin with `context` function is valid
- Plugin without `context` function still works (backwards compatible)
- `context` returning `undefined` produces no output
- `context` returning a string appends to additionalContext
- `context` that throws is caught and warned (not fatal)
- Async `context` functions are awaited

*trigger:*
- Plugin with `trigger` function is valid
- Plugin without `trigger` function still works
- `trigger` returning `undefined` takes no action
- `trigger` returning `{ action: 'block', message }` blocks the tool use
- `trigger` returning `{ action: 'warn', message }` adds a warning
- `trigger` that throws is caught and warned (not fatal)
- Async `trigger` functions are awaited
- `trigger` block takes precedence over static rule warn (highest severity wins)

### Step 2: Thread `context` and `trigger` through plugin resolution

**Files to modify:**
- `src/config/schema.ts` (`applyPlugins`) — preserve `context` and `trigger` functions from resolved plugins alongside files/rules

Currently `applyPlugins` merges `files[]` and `rules[]` into the config. It needs to also collect `context` and `trigger` functions into arrays that the hook pipeline can call.

**Approach:** Return a `PluginExtensions` object alongside the merged config:

```typescript
interface PluginExtensions {
    contexts: Array<{ name: string; fn: RCTPlugin['context'] }>
    triggers: Array<{ name: string; fn: RCTPlugin['trigger'] }>
}
```

The hook pipeline receives this alongside the config.

**Tests:**
- `applyPlugins` preserves `context` and `trigger` functions
- Multiple plugins with both functions all collected
- Plugin with only `context` or only `trigger` (no files/rules) works
- Plugin with none of the dynamic functions still works (backwards compat)

### Step 3: Integrate into hook pipeline

**Files to modify:**
- `src/cli/hook.ts` — call plugin `context()` and `trigger()` functions during pipeline evaluation

**Integration points:**

*context:* After `evaluateInjections()` and before `composeOutput()`. For each plugin with a `context` function, call it with the current event and input. Collect non-undefined results into the parts array.

*trigger:* During `evaluateRules()` phase (or immediately after). For each plugin with a `trigger` function, call it with the current event and input. If it returns a block, exit with block decision. If it returns a warn, add to warnings. Severity ordering: block > warn > undefined.

**Tests:**
- End-to-end hook test with plugin providing dynamic context
- End-to-end hook test with plugin providing dynamic trigger (block)
- End-to-end hook test with plugin providing dynamic trigger (warn)
- Plugin context/trigger errors are caught and logged, don't block pipeline
- Plugin trigger block overrides static rule warn
- Plugin outputs included in composed output

### Step 4: Fix pre-existing issues

These touch the same files we're already modifying.

#### 4a: Plugin error visibility (`src/config/schema.ts:110-119`)

**Current:** `console.warn(`[rct] Failed to resolve plugin '${name}': ${...}`)`
**Fix:** Add `[rct] Warning:` prefix consistently. Check for `RCT_DEBUG` env var — if set, log full stack trace.

**Test:** Verify warning format, verify debug mode shows stack trace.

#### 4b: Silent file reference failures (`src/engine/injections.ts:50-78`)

**Current:** `if (!resolved) continue` — no warning.
**Fix:** Add `console.warn(`[rct] Warning: FileRef '${ref}' did not resolve — skipping injection`)`.

**Test:** Verify warning emitted for unresolvable refs.

#### 4c: Unused `staleCheck.format` parameter (`src/config/schema.ts`)

**Current:** `format?: string` accepted but never used.
**Fix:** Remove `format` from `StaleCheckConfig` type in `src/config/types.ts`. Check if any test or config references it.

**Test:** Verify type no longer accepts `format`.

### Step 5: Update tests + documentation

- Run full `bun test` suite — ensure no regressions
- Update `CLAUDE.md` architecture section to mention plugin `context` and `trigger` capabilities
- Update plugin section in `README.md` with examples
- Lint + format

## Build Sequence

```
Step 1 (interface) → Step 2 (resolution) → Step 3 (pipeline integration)
                                          → Step 4 (pre-existing fixes, parallel with Step 3)
                                          → Step 5 (tests + docs)
```

Steps 3 and 4 can run in parallel — they touch different files (hook.ts vs schema.ts/injections.ts/types.ts).

## Touch Point with Stream 1

After this lands, a follow-up PR updates `rct-plugin-tmux/src/index.ts`:

```typescript
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
        // v2: warn if Bash command conflicts with a watched pane process
        return undefined
    }
}
```
