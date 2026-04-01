# rct-plugin-tmux Design Spec

**Date:** 2026-03-31
**Status:** Reviewed

## Problem

Claude Code's `Bash` tool runs commands in isolated subprocesses — it can't interact with persistent processes like dev servers, test watchers, or REPLs. The `winterm-mcp` tool talks to the host terminal but lacks tmux awareness (pane targeting, layout management). There's no way for Claude to set up, monitor, and interact with multiple terminal panes as part of a development workflow.

## Solution

Two coordinated work streams delivered as separate feature branches, issues, and draft PRs:

### Stream 1: `rct-plugin-tmux` package

An npm package providing:

1. **An MCP server** with tools for direct tmux pane control (list, read, send, split, close)
2. **A setup command** (`bunx rct-tmux setup`) that writes the MCP server definition to `.mcp.json`
3. **A minimal rct plugin export** (name only — no files/rules until Stream 2 lands)

The MCP server is the v1 product. The rct plugin registration is a placeholder awaiting the dynamic content enhancement from Stream 2.

### Stream 2: rct plugin dynamic content enhancement

Extend rct's `RCTPlugin` interface to support a `context` function that generates content dynamically at hook evaluation time. This enables plugins like tmux to inject runtime-derived context (e.g., current pane layout) through the standard plugin pipeline.

**Touch point:** Once Stream 2 lands, the tmux plugin's `index.ts` is updated to provide a `context` function that returns the tmux layout summary on `SessionStart`. This "welding" is a small follow-up PR.

## Stream 1: rct-plugin-tmux

### Package Structure

```
rct-plugin-tmux/
├── package.json            ← name: "rct-plugin-tmux", bin: { "rct-tmux": ... }
├── src/
│   ├── index.ts            ← default export: RCTPlugin { name: 'tmux' }
│   ├── cli.ts              ← CLI dispatcher: setup | serve
│   ├── setup.ts            ← writes MCP server entry to .mcp.json
│   ├── mcp/
│   │   ├── server.ts       ← MCP server entry (stdio transport)
│   │   └── tools/
│   │       ├── list.ts     ← tmux_list
│   │       ├── read.ts     ← tmux_read
│   │       ├── send.ts     ← tmux_send
│   │       ├── split.ts    ← tmux_split
│   │       └── close.ts    ← tmux_close
│   └── lib/
│       ├── tmux.ts         ← thin wrapper: spawns tmux commands, parses output
│       └── types.ts        ← shared types (PaneInfo, etc.)
├── test/
│   ├── tmux.test.ts        ← tmux wrapper unit tests
│   ├── tools.test.ts       ← MCP tool handler tests
│   ├── plugin.test.ts      ← rct plugin export tests
│   └── setup.test.ts       ← setup command tests
└── README.md
```

### How It Wires Up

**As an rct builtin:**
- Submoduled into `reactive-context-toolkit` repo
- Registered in `src/plugin/index.ts` alongside `track-work` and `issue-scope`
- Users enable via `globals.plugins: ["tmux"]` in `rct.config.json`
- rct resolves it through the existing builtin plugin path

**As a standalone package:**
- `bun add rct-plugin-tmux`
- Users reference it in `globals.plugins: ["rct-plugin-tmux"]`
- rct resolves it through the package plugin path
- MCP server configured independently

**MCP server installation:**
- `bunx rct-tmux setup` writes to `.mcp.json`:
  ```json
  {
    "mcpServers": {
      "rct-tmux": {
        "command": "bunx",
        "args": ["rct-tmux", "serve"]
      }
    }
  }
  ```
- `bunx rct-tmux serve` starts the MCP server (stdio transport)

### MCP Tools

All tools target panes by `target` string using tmux's standard addressing: `session:window.pane` (e.g., `claude-team:0.1`). When `$TMUX` is set, tools default to the current session. When unset, `target` is required and tools return a descriptive error if omitted.

#### `tmux_list`

List all panes in the current or specified session with metadata.

**Parameters:**
- `session?` (string) — session name filter; omit for all sessions

**Returns:** Array of pane info objects:
```json
[{
  "target": "claude-team:0.0",
  "width": 100,
  "height": 32,
  "command": "bash",
  "active": true
}]
```

**Implementation:** `tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}'`

Uses tab delimiters to avoid ambiguity from commands containing spaces.

#### `tmux_read`

Capture the visual buffer from a pane.

**Parameters:**
- `target` (string) — pane target (e.g., `claude-team:0.1`)
- `lines?` (number) — number of lines to capture (default: 50)
- `history?` (boolean) — include scrollback history (default: false, visible area only)

**Returns:** String content of the pane.

**Behavior notes:**
- `capture-pane` reads the terminal's visual buffer, including TUI output (not just shell commands/output). A pane running a TUI application (like Claude Code itself, vim, htop) will return the rendered screen, not underlying text.
- With `history: false` (default): captures only the visible area (pane height lines).
- With `history: true`: captures full scrollback buffer (`-S -`), which can be large.
- Lines may be truncated to pane width. Content reflects what's visually rendered.

**Implementation:**
- Default: `tmux capture-pane -t <target> -p -S -<lines>`
- With history: `tmux capture-pane -t <target> -p -S -`

#### `tmux_send`

Send keys (commands) to a pane.

**Parameters:**
- `target` (string) — pane target
- `keys` (string) — text to send
- `enter?` (boolean) — append Enter key (default: true)

**Returns:** Confirmation string.

**Implementation:** `tmux send-keys -t <target> <keys> [Enter]`

Keys are passed as separate arguments to `Bun.spawn()` (array form), not interpolated into a shell string.

#### `tmux_split`

Create a new pane by splitting an existing one.

**Parameters:**
- `target?` (string) — pane to split (default: current)
- `direction?` (string) — `horizontal` or `vertical` (default: `vertical`)
- `percent?` (number) — size percentage (default: 50)
- `command?` (string) — command to run in new pane

**Returns:** New pane's target identifier.

**Implementation:** `tmux split-window -t <target> [-h|-v] -p <percent> -d -P -F '#{session_name}:#{window_index}.#{pane_index}'`

Uses `-d` to keep focus on the original pane. Uses `-P -F` to print the new pane's target.

#### `tmux_close`

Close a pane.

**Parameters:**
- `target` (string) — pane to close

**Returns:** Confirmation string.

**Implementation:** `tmux kill-pane -t <target>`

**Safety:** Refuses to close the last pane in a session (checks pane count via `tmux list-panes` first).

### tmux Wrapper (`src/lib/tmux.ts`)

Thin layer over `Bun.spawn()` that:
- Runs tmux commands via array-form subprocess spawning (no shell string interpolation)
- Parses structured output using tab-delimited format strings
- Validates target strings against `^[a-zA-Z0-9_:./-]+$` pattern
- Throws typed errors for: tmux not found, session not found, pane not found, invalid target
- No platform-specific code — targets standard tmux commands

```typescript
interface PaneInfo {
  target: string
  width: number
  height: number
  command: string
  active: boolean
}

async function exec(args: string[]): Promise<{ stdout: string; exitCode: number }>
function parseListPanes(output: string): PaneInfo[]
function validateTarget(target: string): void  // throws on invalid
```

### Error Handling

**tmux not installed:** MCP server starts normally. Each tool call checks for tmux binary availability and returns `{ isError: true, content: [{ type: "text", text: "tmux is not installed or not in PATH" }] }`.

**No active session:** Tools return `{ isError: true, content: [{ type: "text", text: "No tmux session found. Start one with: tmux new-session -s <name>" }] }`.

**Invalid target:** Tools return `{ isError: true, content: [{ type: "text", text: "Invalid pane target '<target>'. Use format: session:window.pane" }] }`.

**Trust model:** This MCP server assumes a trusted client (Claude Code). Input validation prevents accidental misuse and subprocess injection, not adversarial attacks.

### Setup Command

`bunx rct-tmux setup` performs:

1. Read `.mcp.json` from project root (create if missing)
2. Merge `rct-tmux` server entry (preserve existing servers)
3. Write `.mcp.json`
4. Print confirmation with next steps

Does NOT touch `.claude/settings.json`.

### Dependencies

- **Production:** `@modelcontextprotocol/sdk` (MCP protocol handling)
- **Dev:** `bun:test`, `bun-types`

The rct plugin entry point (`src/index.ts`) imports nothing from the MCP SDK — it exports only `{ name: 'tmux' }`. This keeps the submodule safe for rct's builtin plugin resolution, which dynamically imports the plugin module. The MCP dependency is confined to `src/mcp/` and `src/cli.ts`.

## Stream 2: rct Plugin Dynamic Content Enhancement

Separate feature branch, issue, and draft PR in the `reactive-context-toolkit` repo.

### Problem

rct's `RCTPlugin` interface only supports static `files[]` and `rules[]`. Plugins that need to generate content dynamically at hook time (like tmux layout summaries) have no way to participate in the hook pipeline.

### Solution

Extend `RCTPlugin` with an optional `context` function:

```typescript
export interface RCTPlugin extends Pick<RCTConfig, 'rules' | 'files'> {
    name: string
    context?: (event: HookEvent, input: RC.HookInput) => string | Promise<string> | undefined
}
```

The hook pipeline in `cli/hook.ts` calls each plugin's `context()` function (if defined) after evaluating injections and before composing output. Returned strings are appended to the `additionalContext` assembly.

### Changes Required

1. **`src/plugin/types.ts`** — extend `RCTPlugin` interface
2. **`src/config/schema.ts`** (`applyPlugins`) — pass through `context` functions from resolved plugins
3. **`src/cli/hook.ts`** — call plugin `context()` functions during pipeline evaluation
4. **Tests** — new test file for dynamic plugin content

### Touch Point with Stream 1

After Stream 2 lands, a follow-up PR updates `rct-plugin-tmux/src/index.ts` to provide:

```typescript
export default {
    name: 'tmux',
    context: async (event) => {
        if (event !== 'SessionStart') return undefined
        // Run tmux list-panes, format as XML/JSON layout summary
        return formatLayoutSummary(await listPanes())
    }
} satisfies RCTPlugin
```

## Pre-existing Issues to Address

Fix alongside whichever stream touches the relevant files:

1. **Plugin error swallowing** (`src/config/schema.ts:110-119`): Failed plugin loads are silently skipped with `console.warn`. Add a `[rct] Warning:` prefix and log the plugin name clearly. Consider adding a `--verbose` or `RCT_DEBUG` env flag for full stack traces. *(Stream 2)*

2. **Silent file reference failures** (`src/engine/injections.ts:50-78`): Invalid `FileRef` values in injections silently produce no output. Add `console.warn` when a configured ref doesn't resolve. *(Stream 2)*

3. **Unused `format` parameter in stale check** (`src/config/schema.ts:181-197`): `staleCheck.format` is accepted but never used. Remove from the type to avoid confusion. *(Stream 2)*

## Platform Support

- Any standard tmux implementation (Linux, macOS, WSL, tmux-windows)
- No platform-specific flags or workarounds
- Graceful degradation when tmux is unavailable

## Out of Scope (v2+)

- `PostToolUse` auto-injection of watched pane output
- `PreToolUse` conflict warnings
- Agent team integration (per-agent pane assignment)
- Pane tagging/naming system for semantic references
- `.tmux.conf` generation or management
