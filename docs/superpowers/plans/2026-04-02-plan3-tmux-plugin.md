# Execution Plan 3: Tmux Plugin Package

**Spec:** `docs/superpowers/specs/2026-04-02-v1.0.0-release-spec.md` (section 4.3)
**Phase:** 2B (parallel with Plans 2 and 4, after Plan 1 barrier)
**Isolation:** `worktree` — execute in isolated worktree, merge at Phase 2 barrier

## File Ownership (exclusive)

| File | Action |
|------|--------|
| `plugins/rct-plugin-tmux/src/index.ts` | Modify |
| `plugins/rct-plugin-tmux/src/cli.ts` | Review only |
| `plugins/rct-plugin-tmux/src/setup.ts` | Review/modify |
| `plugins/rct-plugin-tmux/src/types.ts` | Modify |
| `plugins/rct-plugin-tmux/src/lib/tmux.ts` | Review/modify |
| `plugins/rct-plugin-tmux/src/lib/types.ts` | Modify |
| `plugins/rct-plugin-tmux/src/mcp/server.ts` | Review/modify |
| `plugins/rct-plugin-tmux/src/mcp/tools/factory.ts` | Rewrite |
| `plugins/rct-plugin-tmux/src/mcp/tools/helpers.ts` | Review only |
| `plugins/rct-plugin-tmux/src/mcp/tools/index.ts` | Review only |
| `plugins/rct-plugin-tmux/src/mcp/tools/close.ts` | Modify |
| `plugins/rct-plugin-tmux/src/mcp/tools/list.ts` | Modify |
| `plugins/rct-plugin-tmux/src/mcp/tools/read.ts` | Modify |
| `plugins/rct-plugin-tmux/src/mcp/tools/send.ts` | Modify |
| `plugins/rct-plugin-tmux/src/mcp/tools/split.ts` | Modify |
| `plugins/rct-plugin-tmux/package.json` | Review/modify |
| `plugins/rct-plugin-tmux/README.md` | Modify |
| `plugins/rct-plugin-tmux/tsconfig.json` | Review only |
| `plugins/rct-plugin-tmux/test/tmux.test.ts` | Review/modify |
| `plugins/rct-plugin-tmux/test/tools.test.ts` | Modify |
| `plugins/rct-plugin-tmux/test/server.test.ts` | Review only |
| `plugins/rct-plugin-tmux/test/setup.test.ts` | Review only |

## Prerequisites

- Plan 1 must be complete (Phase 1 barrier passed)
- Read the spec section 4.3
- Read all files listed above
- Run `bun test plugins/rct-plugin-tmux/test/` to confirm baseline

## Steps

### Step 1: Simplify the factory pattern (`src/mcp/tools/factory.ts`)

**Current state:** Factory wraps every handler with `preflight(params.target)`, assuming all tools have a `target` parameter. This is a leaky abstraction.

**Target state:** Factory handles only registration boilerplate. No implicit preflight.

Rewrite `createTool`:
```typescript
import type { ToolOptions, ToolCallback, McpServer } from '#types'
import { z } from 'zod'
import type { McpResultSchema } from './helpers'

export function createTool<T extends z.ZodObject<z.ZodRawShape>>(
    options: ToolOptions<T>,
    handler: (params: z.infer<T>) => Promise<z.infer<McpResultSchema>>,
) {
    const name = options.title
        .split(' ')
        .map((s) => s.toLowerCase())
        .join('_')
    return {
        name,
        options,
        handler,
        register: (server: McpServer) =>
            server.registerTool<McpResultSchema, T>(
                name,
                options,
                handler as ToolCallback<T>,
            ),
    }
}

export default createTool
```

Key change: `handler` is passed through directly, no wrapping.

### Step 2: Add explicit preflight to each tool handler

Each tool callback must now call `preflight()` directly. The `preflight` function from `helpers.ts` accepts an optional `target` parameter.

**For each tool file (`list.ts`, `read.ts`, `send.ts`, `close.ts`, `split.ts`):**

1. Add `import { preflight } from './helpers'` if not already imported
2. Add the following two lines as the **first lines** of the handler function body (before any other logic):
   ```typescript
   const check = await preflight(params.target)  // or just preflight() for list.ts
   if (check) return check
   ```
3. **Do not modify any other lines** in the handler function

**Tool-specific notes:**
- **`list.ts`**: Has no `target` param. Use `await preflight()` (no argument) — this checks tmux availability and session existence only
- **`split.ts`**: `target` is optional. `preflight(target)` handles undefined correctly (skips target validation)
- **`read.ts`, `send.ts`, `close.ts`**: `target` is required. `preflight(target)` validates it

### Step 3: Fix error messages to use stderr

In the following files, change error messages to prefer `stderr` over `stdout`:

**`read.ts`:**
```typescript
if (exitCode !== 0) return err(`tmux capture-pane failed: ${stderr || stdout}`)
```
(Currently uses `stdout` only — needs to read both stdout and stderr from exec)

Wait — check: does `exec()` return `{ stdout, stderr, exitCode }`? Yes (line 7 of `tmux.ts`). So read.ts needs to destructure `stderr` as well:
```typescript
const { stdout, stderr, exitCode } = await exec(args)
if (exitCode !== 0) return err(`tmux capture-pane failed: ${stderr || stdout}`)
```

**`split.ts`:**
```typescript
const { stdout, stderr, exitCode } = await exec(args)
if (exitCode !== 0) return err(`tmux split-window failed: ${stderr || stdout}`)
```

**`send.ts`:**
```typescript
const { exitCode, stderr } = await exec(['send-keys', '-t', target, '-l', keys])
if (exitCode !== 0) return err(`tmux send-keys failed: ${stderr}`)
```

### Step 4: Update `InvalidTargetError` message

In `src/lib/types.ts`, update the error message:
```typescript
export class InvalidTargetError extends Error {
    constructor(target: string) {
        super(
            `Invalid tmux target '${target}'. Use session:window.pane format (e.g., dev:0.1).`,
        )
        this.name = 'InvalidTargetError'
    }
}
```

Keep the regex (`/^[a-zA-Z0-9_:./$@%-]+$/`) unchanged — it's deliberately permissive.

### Step 5: Update plugin export (`src/index.ts`)

**Current state:** `definePlugin({ name: 'rct-plugin-tmux' })`

**Target state:** After Plan 1, `definePlugin` no longer accepts setup as second arg, and `name` is optional. The tmux plugin is minimal (no files, no rules, no context, no trigger). Simplify:
```typescript
import { definePlugin } from 'reactive-context-toolkit'
export default definePlugin({ name: 'rct-plugin-tmux' })
```

Keep `name` explicit here since `rct-plugin-tmux` is the display name. Alternatively, omit it and let `displayName` derive it from the package name — both produce the same result.

### Step 6: Review `setup.ts`

The setup command (`runSetup`) already has proper validation:
- JSON shape validation (typeof check + Array.isArray guard)
- mcpServers shape validation  
- Backup on invalid JSON
- Idempotent writes

Verify these are correct by reading the file. No changes expected unless review finds issues.

### Step 7: Update README.md

Address Copilot findings:
1. Clarify this is a workspace-internal package (part of reactive-context-toolkit monorepo)
2. Fix tool descriptions:
   - `tmux_close`: "refuses to close last pane in its **window**" (not session)
   - `tmux_list`: clarify it lists all sessions by default, or filters by session name
3. Remove claim about `$TMUX` defaulting behavior (not implemented)
4. Add note: "Dynamic context injection for tmux pane layout is planned for a future version."

### Step 8: Update tests

**`test/tools.test.ts`:**
- Tests currently rely on factory calling preflight implicitly. After Step 1, each handler calls preflight directly. The test mocking approach may need updating.
- Verify: do the tool tests mock `preflight` or `isAvailable`/`hasSession`? Check the test file.
- If tests mock at the tmux lib level (`isAvailable`, `hasSession`, `exec`), they should still work since the preflight call just moved from factory to handler.
- If tests mock `preflight` directly on the factory, they need updating.
- Update any tests that verify factory behavior.

**`test/tmux.test.ts`:**
- Verify `validateTarget` tests are comprehensive
- Verify `parseListPanes` tests cover edge cases
- No changes expected

### Step 9: Run plugin tests

```sh
bun test plugins/rct-plugin-tmux/test/
```

All tests must pass.

### Step 10: Run full test suite

```sh
bun test
```

All tests must pass. If any fail outside the owned files, do NOT fix them — report at the barrier.

## Success Criteria

- [ ] Factory pattern simplified — no implicit preflight
- [ ] Each tool handler calls preflight directly with correct parameters
- [ ] Error messages use stderr (not just stdout)
- [ ] InvalidTargetError message updated
- [ ] Plugin export uses new definePlugin signature
- [ ] README updated per Copilot findings
- [ ] All tmux plugin tests pass
- [ ] All project tests pass
- [ ] No files outside ownership list modified

## Barrier: Phase 2 → Phase 3

After this plan completes:
1. Commit all changes in worktree
2. Report: files changed, tests passing
3. Wait for Plans 2 and 4 to complete
4. Merge all worktrees at Phase 2 barrier
