# Implementation Plan: Stream 1 — rct-plugin-tmux

**Spec:** `docs/superpowers/specs/2026-03-31-rct-plugin-tmux-design.md`
**Branch:** `feat/rct-plugin-tmux`
**Issue:** TBD (created during setup)
**Draft PR:** TBD (created during setup)

## Prerequisites

- [ ] Create feature branch `feat/rct-plugin-tmux` from `main`
- [ ] Create GitHub issue for tracking
- [ ] Create draft PR linked to issue

## Steps

### Step 1: Scaffold package

Create the `rct-plugin-tmux/` directory as a submodule-ready package.

**Files to create:**
- `rct-plugin-tmux/package.json` — name, version, bin, exports, dependencies
- `rct-plugin-tmux/tsconfig.json` — strict, ESNext, path aliases matching rct conventions
- `rct-plugin-tmux/src/index.ts` — placeholder rct plugin export: `export default { name: 'tmux' }`
- `rct-plugin-tmux/src/cli.ts` — CLI dispatcher: `setup` | `serve`
- `rct-plugin-tmux/src/lib/types.ts` — `PaneInfo` interface, error types

**Acceptance:** `bun run rct-plugin-tmux/src/index.ts` doesn't error. Package exports are resolvable.

### Step 2: tmux wrapper (`src/lib/tmux.ts`)

Core abstraction over tmux subprocess calls. TDD: write tests first.

**Files to create:**
- `rct-plugin-tmux/src/lib/tmux.ts`
- `rct-plugin-tmux/test/tmux.test.ts`

**Functions:**
- `exec(args: string[]): Promise<{ stdout: string; exitCode: number }>` — array-form `Bun.spawn()`
- `isAvailable(): Promise<boolean>` — checks if `tmux` binary exists
- `hasSession(): Promise<boolean>` — checks if any session is active
- `parseListPanes(output: string): PaneInfo[]` — tab-delimited parser
- `validateTarget(target: string): void` — regex validation, throws `InvalidTargetError`
- `getCurrentSession(): string | undefined` — reads `$TMUX` env var, extracts session name

**Tests:**
- `parseListPanes` with various inputs (single pane, multiple, empty)
- `validateTarget` with valid and invalid targets
- `exec` with mocked `Bun.spawn` for error cases (tmux not found, non-zero exit)
- `getCurrentSession` with and without `$TMUX`

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

**Tests per tool:**
- Happy path with expected tmux output
- tmux not installed → error response
- No session → error response
- Invalid target → error response
- Tool-specific edge cases (e.g., `close` on last pane, `read` with history flag, `split` returning new pane target)

### Step 4: MCP server

Wire tool handlers into an MCP server using `@modelcontextprotocol/sdk`.

**Files to create:**
- `rct-plugin-tmux/src/mcp/server.ts`

**Implementation:**
- Import `@modelcontextprotocol/sdk/server` and `StdioServerTransport`
- Register 5 tools with JSON Schema parameter definitions
- Route tool calls to handlers from Step 3
- Server name: `rct-tmux`

**Testing:** Integration test — spawn server process, send JSON-RPC initialize + tool call, verify response. (Can be manual/smoke test if MCP protocol testing is complex.)

### Step 5: Setup command

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

**Files to modify:**
- `rct-plugin-tmux/src/cli.ts` — route `setup` and `serve` subcommands
- `rct-plugin-tmux/package.json` — verify `bin` field

**Acceptance:** `bunx rct-tmux setup` and `bunx rct-tmux serve` both work.

### Step 7: Register as rct builtin

**Files to modify in rct repo:**
- `src/plugin/index.ts` — import and register tmux plugin
- Add git submodule reference

**Files to create:**
- `test/plugin-tmux.test.ts` — verify tmux plugin is in registry, has correct name

### Step 8: README + final review

- `rct-plugin-tmux/README.md` — installation, setup, tool reference
- Run full test suite
- Lint + format check

## Build Sequence

```
Step 1 (scaffold) → Step 2 (tmux wrapper) → Step 3 (tool handlers) → Step 4 (MCP server)
                                                                    → Step 5 (setup command)
                                                                    → Step 6 (CLI)
                                           → Step 7 (rct builtin registration)
                                           → Step 8 (README + review)
```

Steps 3-6 can partially parallelize: tool handlers and setup command are independent. Step 7 depends on the package being functional. Step 8 is final.
