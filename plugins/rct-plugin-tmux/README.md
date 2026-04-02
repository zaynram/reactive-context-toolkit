# rct-plugin-tmux

MCP server for tmux pane control, packaged as an [rct](https://github.com/nickarrow/reactive-context-toolkit) builtin plugin.

## Installation

### As an rct builtin

Enable in your `rct.config.json`:

```json
{ "globals": { "plugins": ["tmux"] } }
```

### As a standalone package

```sh
bun add rct-plugin-tmux
```

Then reference in config:

```json
{ "globals": { "plugins": ["rct-plugin-tmux"] } }
```

## MCP Server Setup

```sh
bunx rct-tmux setup   # writes MCP entry to .mcp.json
bunx rct-tmux serve    # starts the MCP server (stdio)
```

The setup command writes this to `.mcp.json`:

```json
{
    "mcpServers": {
        "rct-tmux": { "command": "bunx", "args": ["rct-tmux", "serve"] }
    }
}
```

## Tools

All tools target panes using tmux's standard addressing: `session:window.pane` (e.g., `dev:0.1`). You must specify explicit targets where required (e.g., for `tmux_read`, `tmux_send`, and `tmux_close`). `tmux_list` lists all sessions and panes by default.

### tmux_list

List all panes with metadata (target, dimensions, running command, active state).

| Parameter | Type   | Required | Description            |
| --------- | ------ | -------- | ---------------------- |
| session   | string | no       | Filter by session name |

### tmux_read

Capture the visual buffer from a pane.

| Parameter | Type    | Required | Description                           |
| --------- | ------- | -------- | ------------------------------------- |
| target    | string  | yes      | Pane target                           |
| lines     | number  | no       | Lines to capture (default: 50)        |
| history   | boolean | no       | Include full scrollback (default: no) |

**Note:** `capture-pane` reads the terminal's visual buffer. A pane running a TUI (vim, htop) returns the rendered screen, not underlying text.

### tmux_send

Send text to a pane. Uses `send-keys -l` for literal text (key names like "Enter" or "Escape" are sent as literal characters, not interpreted).

| Parameter | Type    | Required | Description                     |
| --------- | ------- | -------- | ------------------------------- |
| target    | string  | yes      | Pane target                     |
| keys      | string  | yes      | Text to send                    |
| enter     | boolean | no       | Append Enter key (default: yes) |

### tmux_split

Create a new pane by splitting an existing one. Returns the new pane's target.

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| target    | string | no       | Pane to split                        |
| direction | string | no       | `horizontal` or `vertical` (default) |
| percent   | number | no       | Size percentage (default: 50)        |
| command   | string | no       | Command to run in new pane           |

### tmux_close

Close a pane. Refuses to close the last pane in its window.

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| target    | string | yes      | Pane target |

## Error Handling

- **tmux not installed:** Each tool returns a descriptive MCP error response.
- **No active session:** Tools return an error suggesting `tmux new-session -s <name>`.
- **Invalid target:** Targets are validated against `^[a-zA-Z0-9_:./$@%-]+$`.

## Development

This is a workspace-internal package within the reactive-context-toolkit monorepo.

```sh
cd plugins/rct-plugin-tmux
bun install
bun test
```
