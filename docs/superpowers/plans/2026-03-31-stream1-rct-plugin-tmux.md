# Implementation Plan: Stream 1 — rct-plugin-tmux

**Spec:** `docs/superpowers/specs/2026-03-31-rct-plugin-tmux-design.md`
**Branch:** `feat/rct-plugin-tmux`
**Issue:** #6
**Draft PR:** #7

## Prerequisites

- [x] Create feature branch `feat/rct-plugin-tmux` from `main`
- [x] Create GitHub issue for tracking
- [x] Create draft PR linked to issue

## Steps

### Step 0: MCP SDK spike

Verify `@modelcontextprotocol/sdk` works under Bun before investing in tool handlers.

**Actions:**
- Create a minimal MCP server with one dummy tool under Bun
- Verify JSON-RPC initialize handshake completes via stdio
- If SDK doesn't work on Bun, fall back to raw JSON-RPC stdio protocol

**Acceptance:** Dummy MCP server starts, responds to `initialize`, and handles a tool call under Bun runtime. Spike code can be discarded after validation.

### Step 1: Scaffold package

Create the `rct-plugin-tmux/` directory as a local package within the repo (not a submodule — submodules require a separate repository, which is unnecessary overhead for v1).

**Files to create:**
- `rct-plugin-tmux/package.json` — name, version, bin, exports, dependencies (`@modelcontextprotocol/sdk`)
- `rct-plugin-tmux/tsconfig.json` — strict, ESNext, Bun types
- `rct-plugin-tmux/src/index.ts` — placeholder rct plugin export: `export default { name: 'tmux' }`
- `rct-plugin-tmux/src/cli.ts` — CLI dispatcher: `setup` | `serve`
- `rct-plugin-tmux/src/lib/types.ts` — `PaneInfo` interface, error types (`TmuxNotFoundError`, `InvalidTargetError`, `NoSessionError`)

**Acceptance:** `bun install` succeeds in package directory. `bun run rct-plugin-tmux/src/index.ts` doesn't error.

### Step 2: tmux wrapper (`src/lib/tmux.ts`)

Core abstraction over tmux subprocess calls. TDD: write tests first.

**Files to create:**
- `rct-plugin-tmux/src/lib/tmux.ts`
- `rct-plugin-tmux/test/tmux.test.ts`

**Functions:**
- `exec(args: string[]): Promise<{ stdout: string; exitCode: number }>` — array-form `Bun.spawn()`, never shell strings
- `isAvailable(): Promise<boolean>` — checks if `tmux` binary exists (runs `tmux -V`)
- `hasSession(): Promise<boolean>` — checks if any session is active (`tmux list-sessions`)
- `parseListPanes(output: string): PaneInfo[]` — tab-delimited parser
- `validateTarget(target: string): void` — regex `^[a-zA-Z0-9_:./$@%-]+$`, throws `InvalidTargetError`. Includes `$`, `@`, `%` for tmux ID-based targeting.
- `getCurrentSession(): Promise<string | undefined>` — checks `$TMUX` is set (truthy only), then runs `tmux display-message -p '#{session_name}'` to get actual session name. Returns `undefined` if not in tmux.

**Tests:**
- `parseListPanes` with various inputs (single pane, multiple sessions, empty output)
- `validateTarget` with valid targets (`session:0.1`, `$0`, `@1`, `%2`) and invalid targets (`;rm -rf`, empty string)
- `exec` error cases (tmux not found → `TmuxNotFoundError`, non-zero exit)
- `getCurrentSession` with and without `$TMUX` set

### Step 3: MCP tool handlers

Each tool as a pure function that takes validated input and calls the tmux wrapper. TDD: tests first.

**Files to create:**
- `rct-plugin-tmux/src/mcp/tools/list.ts`
- `rct-plugin-tmux/src/mcp/tools/read.ts`
- `rct-plugin-tmux/src/mcp/tools/send.ts`
- `rct-plugin-tmux/src/mcp/tools/split.ts`
- `rct-plugin-tmux/src/mcp/tools/close.ts`
- `rct-plugin-tmux/test/tools.test.ts`

**Each tool handler:**
- Takes typed params object
- Validates inputs (target string, numeric bounds)
- Calls tmux wrapper
- Returns MCP-compliant result `{ content: [{ type: "text", text: ... }] }` or `{ isError: true, content: [...] }`
- Checks tmux availability and session state, returns descriptive errors

**`tmux_send` specifics:**
- Uses `send-keys -l` for literal text (prevents "Enter", "Space", etc. from being interpreted as key names)
- Appends `Enter` via separate `send-keys` call (without `-l`) when `enter: true`
- Two tmux commands per send: `tmux send-keys -t <target> -l "<keys>"` then `tmux send-keys -t <target> Enter`

**Tests per tool:**
- Happy path with expected tmux output
- tmux not installed → MCP error response
- No session → MCP error response
- Invalid target → MCP error response
- `send`: literal text with special key names ("Enter", "Escape") sent correctly via `-l`
- `close`: refuses to close last pane in session
- `read`: with and without `history` flag
- `split`: returns new pane target from `-P -F` output
- `list`: parses tab-delimited format string correctly

### Step 4: MCP server

Wire tool handlers into an MCP server using `@modelcontextprotocol/sdk` (validated in Step 0).

**Files to create:**
- `rct-plugin-tmux/src/mcp/server.ts`
- `rct-plugin-tmux/test/server.test.ts`

**Implementation:**
- Import `@modelcontextprotocol/sdk` server + transport
- Register 5 tools with JSON Schema parameter definitions
- Route tool calls to handlers from Step 3
- Server name: `rct-tmux`

**Testing:** Integration test — spawn server process via `Bun.spawn()`, send JSON-RPC `initialize` + `tools/call`, verify response structure matches MCP protocol. This is a real test, not a smoke test.

### Step 5: Setup command

Independent of Steps 2-4. Can start after Step 1.

**Files to create:**
- `rct-plugin-tmux/src/setup.ts`
- `rct-plugin-tmux/test/setup.test.ts`

**Implementation:**
- Read `.mcp.json` from `process.cwd()` (or `CLAUDE_PROJECT_DIR`)
- Parse JSON, create if missing
- Merge `rct-tmux` server entry into `mcpServers` (preserve existing entries)
- Write `.mcp.json` with `JSON.stringify(data, null, 2)`
- Print confirmation

**Tests:**
- Creates `.mcp.json` when missing
- Merges into existing `.mcp.json` without clobbering other servers
- Updates existing `rct-tmux` entry
- Handles malformed `.mcp.json` gracefully

### Step 6: CLI dispatcher + bin entry

Depends on Step 4 (`serve`) and Step 5 (`setup`).

**Files to modify:**
- `rct-plugin-tmux/src/cli.ts` — route `setup` and `serve` subcommands
- `rct-plugin-tmux/package.json` — verify `bin` field

**Acceptance:** `bunx rct-tmux setup` and `bunx rct-tmux serve` both work.

### Step 7: Register as rct builtin

**Files to modify in rct repo:**
- `src/plugin/index.ts` — import tmux plugin via relative path and register
- No submodule — direct local import: `import tmux from '../../rct-plugin-tmux/src/index'`

**Files to create:**
- `test/plugin-tmux.test.ts` — verify tmux plugin is in registry, has correct name, has no files/rules (v1 placeholder)

### Step 8: README + final review

- `rct-plugin-tmux/README.md` — installation, setup, tool reference, capture-pane behavior notes
- Run full test suite (both rct-plugin-tmux and parent rct)
- Lint + format check

## Build Sequence

```
Step 0 (spike) → Step 1 (scaffold + bun install) → Step 2 (tmux wrapper) → Step 3 (tools) → Step 4 (MCP server) ─┐
                 Step 1 ──────────────────────────→ Step 5 (setup command) ─────────────────────────────────────────┤→ Step 6 (CLI) → Step 7 (builtin) → Step 8 (README)
```

Step 5 starts after Step 1 and runs parallel to Steps 2-4. Step 6 waits for both Step 4 and Step 5.
