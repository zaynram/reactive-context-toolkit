# Execution Plan 4: Pipeline, Integration Tests, Docs & Release

**Spec:** `docs/superpowers/specs/2026-04-02-v1.0.0-release-spec.md` (sections 5–8)
**Phase:** 2C (parallel with Plans 2 and 3, after Plan 1 barrier) + Phase 3 (sequential, after Phase 2 barrier)
**Isolation:** Phase 2C work in `worktree`. Phase 3 work on main branch after merge.

This plan has two phases of work:
- **Phase 2C:** Pipeline fixes + integration tests (in worktree, parallel with Plans 2/3)
- **Phase 3:** Documentation, release finalization (sequential, after all Phase 2 merges)

---

## Phase 2C: Pipeline & Integration Tests

### File Ownership (exclusive for Phase 2C)

| File | Action |
|------|--------|
| `src/cli/hook.ts` | Review/modify |
| `src/engine/compose.ts` | Review only |
| `src/engine/injections.ts` | Review only |
| `test/hook-plugin.test.ts` | Create (restore from PR #9) |
| `test/fixtures/plugin-project/rct.config.json` | Create |
| `test/fixtures/plugin-project/plugins/block-trigger.ts` | Create |
| `test/fixtures/plugin-project/plugins/warn-trigger.ts` | Create |
| `test/fixtures/plugin-project/plugins/context-plugin.ts` | Create |
| `test/fixtures/plugin-project-throwing/rct.config.json` | Create |
| `test/fixtures/plugin-project-throwing/plugins/throwing-context.ts` | Create |
| `test/plugin-dynamic.test.ts` | Modify |
| `test/injections.test.ts` | Review only |

### Prerequisites

- Plan 1 must be complete (Phase 1 barrier passed)
- Read the spec sections 5, 6
- Read current `src/cli/hook.ts`, `src/engine/compose.ts`
- Read PR #9's integration test from `origin/feat/plugin-dynamic-context:test/hook-plugin.test.ts`

### Step 1: Restore PR #9 integration test fixtures

Create the following files from PR #9, adapted for the current architecture:

**`test/fixtures/plugin-project/rct.config.json`:**
```json
{
    "globals": {
        "format": "xml",
        "plugins": [
            "./plugins/block-trigger.ts",
            "./plugins/warn-trigger.ts",
            "./plugins/context-plugin.ts"
        ]
    }
}
```

**`test/fixtures/plugin-project/plugins/block-trigger.ts`:**
```typescript
export default {
    name: 'block-trigger',
    trigger(_event: string, input: { toolName?: string }) {
        if (input.toolName === 'BlockedTool') {
            return {
                action: 'block' as const,
                message: 'BlockedTool is not allowed by plugin',
            }
        }
        return undefined
    },
}
```

**`test/fixtures/plugin-project/plugins/warn-trigger.ts`:**
```typescript
export default {
    name: 'warn-trigger',
    trigger(_event: string, input: { toolName?: string }) {
        if (input.toolName === 'WarnTool') {
            return {
                action: 'warn' as const,
                message: 'WarnTool requires caution',
            }
        }
        return undefined
    },
}
```

**`test/fixtures/plugin-project/plugins/context-plugin.ts`:**
```typescript
export default {
    name: 'context-plugin',
    context(event: string) {
        if (event === 'SessionStart') {
            return '<dynamic-context>tmux layout data</dynamic-context>'
        }
        return undefined
    },
}
```

**`test/fixtures/plugin-project-throwing/rct.config.json`:**
```json
{
    "globals": {
        "format": "xml",
        "plugins": ["./plugins/throwing-context.ts"]
    }
}
```

**`test/fixtures/plugin-project-throwing/plugins/throwing-context.ts`:**
```typescript
export default {
    name: 'throwing-context',
    context() {
        throw new Error('context exploded in integration test')
    },
}
```

### Step 2: Create `test/hook-plugin.test.ts`

Restore from PR #9 with the full integration test suite. This tests the CLI pipeline end-to-end:

```typescript
import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'child_process'
import path from 'path'

const INDEX_PATH = path.resolve(__dirname, '../src/cli/index.ts')
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/plugin-project')
const THROWING_FIXTURE_DIR = path.resolve(__dirname, 'fixtures/plugin-project-throwing')

function runHook(event: string, fixtureDir: string, stdin?: string) {
    const result = spawnSync('bun', ['run', INDEX_PATH, 'hook', event], {
        cwd: fixtureDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: fixtureDir },
        input: stdin,
        encoding: 'utf-8',
        timeout: 15_000,
    })
    return {
        stdout: result.stdout?.trim() ?? '',
        stderr: result.stderr?.trim() ?? '',
        exitCode: result.status ?? 1,
    }
}

describe('hook pipeline — plugin trigger integration', () => {
    it('blocks with exit code 2 when trigger matches', () => {
        const payload = JSON.stringify({ tool_name: 'BlockedTool', tool_input: {} })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(2)
        const parsed = JSON.parse(result.stdout)
        expect(parsed.decision).toBe('block')
        expect(parsed.reason).toContain('BlockedTool is not allowed by plugin')
    })

    it('does not block when trigger does not match', () => {
        const payload = JSON.stringify({ tool_name: 'Read', tool_input: {} })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
    })

    it('warns without blocking when trigger returns warn', () => {
        const payload = JSON.stringify({ tool_name: 'WarnTool', tool_input: {} })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
        const parsed = JSON.parse(result.stdout)
        const ctx = parsed.hookSpecificOutput?.additionalContext ?? ''
        expect(ctx).toContain('WarnTool requires caution')
    })
})

describe('hook pipeline — plugin context integration', () => {
    it('injects dynamic output on SessionStart', () => {
        const result = runHook('SessionStart', FIXTURE_DIR)
        expect(result.exitCode).toBe(0)
        const parsed = JSON.parse(result.stdout)
        expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
        const ctx = parsed.hookSpecificOutput.additionalContext ?? ''
        expect(ctx).toContain('tmux layout data')
    })

    it('does not inject on non-matching events', () => {
        const payload = JSON.stringify({ tool_name: 'Read', tool_input: {} })
        const result = runHook('PostToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
        if (result.stdout) {
            const parsed = JSON.parse(result.stdout)
            const ctx = parsed.hookSpecificOutput?.additionalContext ?? ''
            expect(ctx).not.toContain('tmux layout data')
        }
    })
})

describe('hook pipeline — plugin error isolation', () => {
    it('throwing context does not break the pipeline', () => {
        const result = runHook('SessionStart', THROWING_FIXTURE_DIR)
        expect(result.exitCode).toBe(0)
    })
})
```

### Step 3: Fix test names in `test/plugin-dynamic.test.ts`

Find tests with misleading names (Copilot finding). Specifically:
- Tests that say "is caught and warned (not fatal)" but only assert that the function throws
- Either rename to match what's actually tested, OR extend the test to verify the pipeline catch/warn behavior

**Preferred approach:** Rename for accuracy. The integration test (`hook-plugin.test.ts`) tests the full pipeline error handling. Unit tests should test the behavior they actually verify.

Example rename:
- "throwing context is caught and warned" → "throwing context function throws an error" (if only testing that it throws)
- OR extend to test `withTimeout` wrapping: call `withTimeout(() => plugin.context(event, input), 5000, 'test')` and verify it returns `undefined` and logs a warning

### Step 4: Review `src/cli/hook.ts`

**Current state:** Pipeline order is correct (triggers before rules). `withTimeout` has proper timer cleanup. 

**Verify:**
1. `withTimeout` sentinel pattern is correct (line 34-55)
2. Plugin trigger loop (line 108-131) correctly handles block and warn
3. Plugin context loop (line 168-178) correctly handles undefined results
4. Warn messages combine static rules + plugin triggers (line 181-184)

**Expected changes:** None — the pipeline is correct. If review finds issues, fix them.

### Step 5: Run integration tests

```sh
bun test test/hook-plugin.test.ts
```

All 6 integration tests must pass. If they fail, debug:
1. Check that fixture plugin files are syntactically correct
2. Check that `CLAUDE_PROJECT_DIR` env var is being set
3. Check that `loadConfig` finds the fixture `rct.config.json`
4. Check that local plugin resolution (`./plugins/...`) works from the fixture directory

### Step 6: Run full test suite

```sh
bun test
```

All tests must pass (target: 360+ with new integration tests).

---

## Phase 3: Documentation, Cleanup & Release

### File Ownership (Phase 3 — after all Phase 2 merges)

| File | Action |
|------|--------|
| `CLAUDE.md` | Update |
| `README.md` | Update |
| `package.json` | Review version |
| `rct.config.schema.json` | Update if types changed |
| `docs/superpowers/specs/2026-03-28-*` | Move to archive |
| `docs/archive/` | Create directory |
| All `docs/superpowers/plans/*.md` | Add status headers |
| All `docs/superpowers/specs/*.md` | Add status headers |

### Prerequisites

- Phase 2 barrier passed: all 3 worktrees merged, full test suite passes
- Read current CLAUDE.md and README.md

### Step 7: Merge Phase 2 worktrees

1. Merge Plan 2 worktree branch
2. Merge Plan 3 worktree branch
3. Merge Plan 4 Phase 2C worktree branch (this plan's own worktree)
4. Run `bun test` — all tests must pass
5. Run `bun lint` — no errors
6. Resolve any merge conflicts (should be none if file ownership was respected)

### Step 8: Update CLAUDE.md

Update these sections to reflect v1.0.0 changes:
1. **Architecture tree:** Update `src/plugin/` descriptions:
   - `types.ts` — add `setup?` and note `name` is optional
   - `validate.ts` — note validates all optional property types
   - `index.ts` — note keyed by BUILTIN_PLUGINS package name
   - Add `validate.ts` if not already in tree
2. **Key Data Flow:** Update step 4 to mention setup lifecycle
3. **Plugin interface:** Update to show `setup?` and optional `name`
4. **Meta section:** Add note about using meta as self-briefing mechanism

Do NOT add new sections that aren't needed. Keep CLAUDE.md focused on what a developer working in the codebase needs to know.

### Step 8b: Check `rct.config.schema.json`

Verify whether the JSON Schema needs updates for plugin-related type changes:
- `RCTPlugin.name` is now optional — check if the schema references plugin name requirements
- `globals.plugins` array — check if it documents plugin name format
- If changes are needed, update. If not, skip.

### Step 9: Update README.md

1. Add a "Plugin Authoring" section (brief — 10-15 lines) showing:
   - Minimal plugin: `definePlugin({ files: [...] })`
   - Plugin with setup: `definePlugin({ files: [...], setup() { ... } })`
   - Plugin with context: `definePlugin({ context(event, input) { ... } })`
2. Document `meta` as self-briefing mechanism:
   ```json
   "meta": { "injectOn": "SessionStart", "include": ["files", "rules", "plugins"] }
   ```
3. Update the public API exports list if it changed

### Step 10: Stale documentation cleanup

1. Create `docs/archive/` directory
2. Move `docs/specs/2026-03-28-rct-v1-design.md` → `docs/archive/` with header: `<!-- SUPERSEDED by docs/superpowers/specs/2026-04-02-v1.0.0-release-spec.md -->`
3. Move `docs/specs/2026-03-28-rct-v1-plan.md` → `docs/archive/` with same header
4. Add `status: COMPLETE` or `status: SUPERSEDED` headers to all specs/plans in `docs/superpowers/`

### Step 11: Close PR #9

```sh
gh pr close 9 --comment "Superseded by PR #7. Dynamic context/trigger support, withTimeout, and integration tests are all incorporated into the v1.0.0 release branch."
```

### Step 12: Update PR #7 description

Update the PR body to reflect the full scope of changes:
```markdown
## Summary
- Migrate builtin plugins to workspace packages (`plugins/rct-plugin-issue-scope`, `rct-plugin-track-work`, `rct-plugin-tmux`)
- Add dynamic `context()` and `trigger()` support to RCTPlugin interface (absorbs PR #9)
- Add `setup()` lifecycle to RCTPlugin, called in `applyPlugins` with error isolation
- Make `name` optional on RCTPlugin, derive display name from package ref
- Add rct-plugin-tmux: MCP server for tmux pane control
- Fix plugin registry keying, validation, factory pattern
- Restore end-to-end integration tests for plugin pipeline
- Documentation cleanup and archive

## Test plan
- [INSERT ACTUAL COUNT from `bun test` output] tests passing
- End-to-end CLI integration tests for plugin trigger block/warn/context
- Plugin setup error isolation verified
- All Copilot review findings addressed
```

### Step 13: Create changelog

Create a summary of changes per commit range. Use:
```sh
git log --oneline main..HEAD
```

Include in the release notes (Step 15).

### Step 14: Final verification

```sh
bun check  # format + lint:fix + test
```

Everything must be clean.

### Step 15: Merge PR to main

```sh
gh pr merge 7 --merge
```

If branch protection blocks this, try with admin bypass or request review. Document the reason if bypassing.

After merge, pull main locally:
```sh
git checkout main
git pull origin main
```

### Step 16: Tag and release

Tag must be on main (not the feature branch):
```sh
git tag v1.0.0
git push origin v1.0.0
```

Create GitHub release:
```sh
gh release create v1.0.0 --title "v1.0.0" --notes "$(cat <<'EOF'
## Reactive Context Toolkit v1.0.0

First stable release. Zero-dependency TypeScript/Bun Claude Code hook handler.

### Highlights
- Plugin system with workspace package architecture
- Dynamic context injection and trigger-based enforcement
- Plugin setup lifecycle with error isolation
- Three builtin plugins: issue-scope, track-work, tmux (MCP server)
- Comprehensive test suite (360+ tests)

### Breaking Changes (from pre-release)
- Builtin plugin names changed to full package names (e.g., `rct-plugin-track-work`)
- `applyPlugins()` returns `{ config, extensions }` instead of `ValidatedConfig`
- `definePlugin()` no longer accepts a second `setup` argument
- `RCTPlugin.name` is now optional

### Installation
\`\`\`sh
bun add github:zaynram/reactive-context-toolkit
bunx rct init
\`\`\`
EOF
)"
```

### Step 17: Verify release

```sh
gh release view v1.0.0
git log --oneline -1 v1.0.0  # should show merge commit on main
```

## Success Criteria

- [ ] Integration tests restored and passing (6 tests)
- [ ] Test names in plugin-dynamic.test.ts are accurate
- [ ] CLAUDE.md updated for v1.0.0 architecture
- [ ] README.md has plugin authoring section and self-briefing docs
- [ ] Stale docs archived
- [ ] PR #9 closed
- [ ] PR #7 description updated
- [ ] All tests pass (`bun check` clean)
- [ ] Tagged v1.0.0
- [ ] GitHub release created
- [ ] PR merged to main
