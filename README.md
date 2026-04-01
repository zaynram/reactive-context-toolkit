# reactive-context-toolkit

A zero-dependency Claude Code hook library that reactively injects context into AI sessions based on configurable rules, events, and file references.

## What It Does

RCT runs as a Claude Code hook handler. It reads an `rct.config.{json,ts,js}` in your project and, on each hook event, decides what context to add to Claude's prompt — or whether to block a tool call entirely.

- **Context injection** — inject file contents (XML or JSON) into Claude's `additionalContext` based on event and match conditions
- **Rules** — block or warn when Claude attempts a matched tool use
- **Language ecosystem** — auto-surface bun scripts, pixi tasks, cargo info, and tsconfig path aliases
- **Test integration** — run your test suite and inject results into session context, with optional caching
- **Stale detection** — flag dated files that have gone out of date
- **Plugins** — built-in `track-work` and `issue-scope` plugins contribute files and rules

## Getting Started

```sh
bun add github:zaynram/reactive-context-toolkit
bunx rct init
```

`rct init` detects your project stack (TS/JS/Python/Rust), writes an `rct.config.json`, and patches `.claude/settings.json` with the required hook commands. RCT has zero production dependencies — the hook subprocess (`dist/rct.js`) runs entirely on Bun.

## Configuration

`rct.config.json` (or `.ts` / `.js`):

```json
{
    "globals": { "format": "xml", "plugins": ["track-work"], "minify": true },
    "files": [
        {
            "alias": "scope",
            "path": "dev/scope.xml",
            "injectOn": "SessionStart",
            "staleCheck": { "dateTag": "date", "wrapTag": "stale-scope" }
        }
    ],
    "injections": [
        { "on": "PostToolUse", "matchFile": "*.ts", "inject": ["scope"] }
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
    "test": { "command": "bun test", "injectOn": "SessionStart", "cache": true }
}
```

### Config sections

| Section      | Purpose                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `globals`    | Format (`xml`\|`json`), wrapper tag, `briefByDefault`, `minify`, `plugins` |
| `files`      | Register files with aliases; `injectOn` auto-creates injection entries     |
| `injections` | Explicit injection rules with event/match/file filtering                   |
| `rules`      | Block or warn on matched tool use                                          |
| `lang`       | Per-language tool and config declarations                                  |
| `test`       | Test command with optional caching (`cache`, `cacheTTL`)                   |
| `meta`       | Inject a summary of the config itself                                      |

## Hook Events

`SessionStart` · `PreToolUse` · `PostToolUse` · `PostToolUseFailure` · `UserPromptSubmit` · `SubagentStart` · `Notification` · `Setup`

## Match System

Rules and injections use a match condition system:

- **Targets**: `file_path`, `new_string`, `content`, `command`, `user_prompt`, `tool_name`, `error`
- **Operators**: `regex` (default), `contains`, `equals`, `not_contains`, `starts_with`, `ends_with`, `glob`
- Multiple conditions = AND logic; multiple patterns within a condition = OR logic

## FileRef Syntax

Inject references use the pattern `alias[:metaAlias][~brief]`:

- `scope` — full content of the `scope` file
- `scope~brief` — brief/summary mode
- `scope:changelog` — a meta-file attached to `scope`

## Plugins

Enable built-in plugins via `globals.plugins`:

```json
{ "globals": { "plugins": ["track-work", "issue-scope"] } }
```

- **`track-work`** — registers `chores` (`dev/chores.xml`) and `plans` (`.claude/plans/index.xml`)
- **`issue-scope`** — registers `scope` (`.claude/context/scope.xml`, with stale check) and `candidates` (`.claude/context/issues.xml`)

Plugin files and rules are merged at evaluation time via `applyPlugins()`.

## Public API

RCT exports a barrel at `src/index.ts` for programmatic use:

```ts
import {
    // Config
    loadConfig,
    validateConfig,
    desugarFileInjections,
    applyPlugins,
    buildFileRegistry,
    // Engine
    evaluateRules,
    evaluateInjections,
    evaluateMatch,
    evaluateCondition,
    generateMeta,
    composeOutput,
    // Lang
    evaluateLang,
    // Test
    resolveTestCommand,
    runTest,
    formatTestResult,
    // Register
    standard,
    dynamic,
    block,
    // Utilities
    fs,
    xml,
    normalize,
    minify,
    condense,
    // Plugin
    pluginRegistry,
} from 'reactive-context-toolkit'

// Type imports
import type {
    RCTConfig,
    RCTPlugin,
    HookEvent,
    FileRef,
    RuleEntry,
    InjectionEntry,
    MatchCondition,
} from 'reactive-context-toolkit'
```
