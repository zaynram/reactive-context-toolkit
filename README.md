# reactive-context-toolkit

A Claude Code hook library that reactively injects context into your AI sessions based on configurable rules, events, and file references.

## What It Does

RCT runs as a Claude Code hook handler. It reads an `rct.config.json` in your project and, on each hook event (session start, tool use, prompt submit, etc.), decides what context to add to Claude's prompt — or whether to block a tool call entirely.

- **Context injection** — inject file contents as XML into Claude's `additionalContext` based on event and match conditions
- **Rules** — block or warn when Claude attempts a matched tool use
- **Language ecosystem** — auto-inject bun scripts, pixi tasks, cargo info, and tsconfig path aliases
- **Test integration** — run your test suite and inject the result into session context
- **Stale detection** — flag dated files that have gone out of date

## Getting Started

```sh
bun add github:zaynram/reactive-context-toolkit
bunx rct init
```

`rct init` auto-detects your project stack (TS/JS/Python/Rust), writes an `rct.config.json`, and patches `.claude/settings.json` with the required hook commands. RCT has no production dependencies — the `dist/index.js` subprocess runs entirely on Bun.

## Configuration

`rct.config.json` (or `.ts` / `.js`):

```json
{
    "files": [
        {
            "alias": "scope",
            "path": "dev/scope.xml",
            "injectOn": "SessionStart"
        }
    ],
    "injections": [
        {
            "on": "PostToolUse",
            "matchFile": "*.ts",
            "inject": ["scope"]
        }
    ],
    "rules": [
        {
            "on": "PreToolUse",
            "match": { "target": "file_path", "pattern": "\\.env$" },
            "action": "block",
            "message": "Do not read .env files"
        }
    ],
    "lang": {
        "typescript": {
            "tools": [{ "name": "bun", "scripts": true }],
            "config": [
                {
                    "name": "tsconfig",
                    "path": "tsconfig.json",
                    "extractPaths": true
                }
            ]
        }
    },
    "test": { "command": "bun test", "injectOn": "SessionStart" }
}
```

## Hook Events

RCT supports all Claude Code hook events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `SubagentStart`, `Notification`, `Setup`.

## FileRef Syntax

Inject references use the pattern `alias[:metaAlias][~brief]`:

- `scope` — full content of the `scope` file
- `scope~brief` — brief/summary mode
- `scope:changelog` — a meta-file attached to `scope`
