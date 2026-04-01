# reactive-context-toolkit

A zero-dependency Claude Code hook library that reactively injects context into AI sessions based on configurable rules, events, and file references.

## What It Does

RCT runs as a Claude Code hook handler. It reads an `rct.config.{json,ts,js}` in your project and, on each hook event, decides what context to add to Claude's prompt — or whether to block a tool call entirely.

- **Context injection** — inject file contents (XML or JSON) into Claude's `additionalContext` based on event and match conditions
- **Rules** — block or warn when Claude attempts a matched tool use
- **Language ecosystem** — auto-surface bun scripts, pixi tasks, cargo info, and tsconfig path aliases per language
- **Per-language testing** — run test suites per language with configurable brief formatting and caching
- **Stale detection** — flag dated files that have gone out of date
- **Plugins** — declarative plugins contribute files and rules; custom extensions use `createHook()`
- **Auto-derivation** — `rct init` detects your stack and writes a fully-populated config; `rct update` re-derives while preserving overrides

## Getting Started

```sh
bun add github:zaynram/reactive-context-toolkit
bunx rct init
```

`rct init` runs an interactive wizard that detects your project stack (Node/Python/Rust), writes an `rct.config.json` with all derived values explicit, and patches `.claude/settings.json` with the required hook commands. Use `--yes` for non-interactive mode (CI, Docker, scripts).

RCT has zero production dependencies — Bun resolves the `bin` field directly to source, no build step.

### Updating

```sh
bunx rct update
```

Re-derives config from your project, merges with existing config preserving your overrides, and updates settings. Uses a stored `_derived` baseline for three-way merge.

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
    "rules": [
        {
            "on": "PreToolUse",
            "match": { "target": "file_path", "pattern": "\\.env$" },
            "action": "block",
            "message": "Do not read .env files"
        }
    ],
    "lang": {
        "node": {
            "tools": [{ "name": "bun", "scripts": true }],
            "test": { "command": "bun test", "brief": "{lang}: {status}" }
        },
        "rust": {
            "tools": [{ "name": "cargo" }],
            "test": { "command": "cargo test" }
        }
    },
    "test": { "injectOn": "SessionStart", "cache": true, "cacheTTL": 300 }
}
```

### Config sections

| Section | Purpose |
|---|---|
| `globals` | Format (`xml`\|`json`), wrapper tag, `briefByDefault`, `minify`, `plugins` |
| `files` | Register files with aliases; `injectOn` auto-creates injection entries |
| `injections` | Explicit injection rules with event/match/file filtering |
| `rules` | Block or warn on matched tool use |
| `lang` | Per-language declarations (`node`/`python`/`rust`) with `tools`, `config`, `test` |
| `test` | Top-level test defaults (`injectOn`, `cache`, `cacheTTL`); per-language overrides in `lang.*.test` |
| `meta` | Inject a summary of the config itself |

### Languages

RCT supports three language ecosystems: `node` (TypeScript + JavaScript), `python`, `rust`. The `node` language auto-discovers tsconfig.json / jsconfig.json if `config` is omitted.

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

## Plugins and Extensions

**Plugins** are declarative — they contribute `files[]` and `rules[]` to the RCT pipeline.

**Extensions** are imperative — custom hook scripts using `createHook()` or the low-level `standard`/`dynamic`/`block` helpers.

### Built-in plugins

```json
{ "globals": { "plugins": ["track-work", "issue-scope"] } }
```

- **`track-work`** — registers `chores` (`dev/chores.xml`) and `plans` (`.claude/plans/index.xml`)
- **`issue-scope`** — registers `scope` (`.claude/context/scope.xml`, with stale check) and `candidates` (`.claude/context/issues.xml`)

### Custom plugins

Place plugin files at `.claude/hooks/rct/*.{ts,js}` or install as npm packages:

```typescript
import { definePlugin } from 'reactive-context-toolkit'

export default definePlugin({
    name: 'my-plugin',
    files: [{ alias: 'guidelines', path: 'docs/guidelines.md', injectOn: 'SessionStart' }],
    rules: [{ on: 'PreToolUse', match: { target: 'file_path', pattern: '\\.sql$' }, action: 'warn', message: 'Check with DBA' }],
})
```

Plugin resolution: built-in name → local file (`./` prefix) → package name.

### Custom extensions

```typescript
import { createHook } from 'reactive-context-toolkit'

createHook(async (input) => {
    return { hookSpecificOutput: { additionalContext: 'Hello from my hook' } }
})
```

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
    deriveFromProject,
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
    resolveLangTestCommand,
    runTest,
    formatTestResult,
    // Library (extensions)
    definePlugin,
    createHook,
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

import type {
    RCTConfig,
    RCTPlugin,
    HookEvent,
    LangTestConfig,
    FileRef,
    RuleEntry,
    InjectionEntry,
    MatchCondition,
} from 'reactive-context-toolkit'
```

All engine and config functions are composable — consumers can build custom pipelines by importing and chaining them directly.
