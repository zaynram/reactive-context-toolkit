# Implementation Plan: Stream 2 — rct Plugin Dynamic Content Enhancement

**Spec:** `docs/superpowers/specs/2026-03-31-rct-plugin-tmux-design.md` (Stream 2 section)
**Branch:** `feat/plugin-dynamic-context`
**Issue:** TBD (created during setup)
**Draft PR:** TBD (created during setup)

## Prerequisites

- [ ] Create feature branch `feat/plugin-dynamic-context` from `main`
- [ ] Create GitHub issue for tracking
- [ ] Create draft PR linked to issue

## Steps

### Step 1: Extend `RCTPlugin` interface

**Files to modify:**
- `src/plugin/types.ts` — add optional `context` function to `RCTPlugin`

```typescript
export interface RCTPlugin extends Pick<RCTConfig, 'rules' | 'files'> {
    name: string
    context?: (event: HookEvent, input: RC.HookInput) => string | Promise<string> | undefined
}
```

**Files to create:**
- `test/plugin-dynamic-context.test.ts` — tests for the new capability

**Tests (write first — TDD):**
- Plugin with `context` function is valid
- Plugin without `context` function still works (backwards compatible)
- `context` returning `undefined` produces no output
- `context` returning a string appends to additionalContext
- `context` that throws is caught and warned (not fatal)
- Async `context` functions are awaited

### Step 2: Thread `context` through plugin resolution

**Files to modify:**
- `src/config/schema.ts` (`applyPlugins`) — preserve `context` functions from resolved plugins alongside files/rules

Currently `applyPlugins` merges `files[]` and `rules[]` into the config. It needs to also collect `context` functions into a new array that the hook pipeline can call.

**Approach:** Add a `pluginContexts` field to the resolved config (or return it separately from `applyPlugins`). The hook pipeline receives the list of `{ name, context }` pairs.

**Tests:**
- `applyPlugins` preserves `context` functions
- Multiple plugins with `context` functions all collected
- Plugin with only `context` (no files/rules) works

### Step 3: Integrate into hook pipeline

**Files to modify:**
- `src/cli/hook.ts` — call plugin `context()` functions during pipeline evaluation

**Integration point:** After `evaluateInjections()` and before `composeOutput()`. For each plugin with a `context` function, call it with the current event and input. Collect non-undefined results into the parts array.

**Tests:**
- End-to-end hook test with a plugin that provides dynamic context
- Plugin context only called for matching events
- Plugin context errors are caught and logged, don't block pipeline
- Plugin context output included in composed output

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
- Update `CLAUDE.md` architecture section to mention plugin `context` capability
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
    }
}
```
