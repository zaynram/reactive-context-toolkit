# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using MCP Task Orchestrator with Superpowers

Always read the usage directives outlined in [mcp-task-orchestrator-and-superpowers.md](.claude/rules/mcp-task-orchestrator-and-superpowers.md) before starting any development work.

## What This Project Is

**Reactive Context Toolkit (RCT)** is a zero-dependency TypeScript/Bun library that acts as a Claude Code hook handler. Consumers install it, run `bunx rct init` to scaffold an `rct.config.json` and patch their `.claude/settings.json`, and the hook runs on every configured hook event via `bun run rct hook <event>`. There is no build step — Bun resolves the `bin` field directly to source.

Based on the event and match conditions in the config, RCT injects context (XML or JSON) into Claude's prompt, blocks or warns on matched tool use, surfaces language-ecosystem info (scripts, tasks, path aliases), and runs tests per language.

## Commands

```sh
bun install                   # install dependencies
bun test                      # run all tests (27 test files in test/)
bun test <pattern>            # run a single test file or matching tests
bun lint                      # lint with oxlint
bun lint:fix                  # lint and auto-fix
bun format                    # format with prettier
bun check                     # format + lint:fix + test (runs on postinstall)
```

### CLI commands

```sh
bunx rct init                 # interactive wizard (--yes for non-interactive)
bunx rct update               # re-derive config from project, merge preserving overrides
bunx rct hook <HookEvent>     # run the hook pipeline (called by Claude Code)
```

### Dev dependencies

- `@anthropic-ai/claude-agent-sdk` — provides `RC` namespace types for hook I/O shapes (`src/types.d.ts`)
- `oxlint` + `oxlint-tsgolint` — linting
- `bun-types` — Bun runtime type declarations

## Architecture

```
src/
├── index.ts             # Public barrel export (with JSDoc)
├── cli/
│   ├── index.ts         # CLI dispatcher: routes init, update, hook
│   ├── hook.ts          # Hook entrypoint: orchestrates evaluation pipeline
│   ├── init.ts          # Interactive wizard + mergeSettings() + detectProject()
│   ├── update.ts        # Non-interactive re-derive + three-way merge
│   └── prompt.ts        # Minimal readline utilities: ask(), confirm(), select()
├── config/
│   ├── types.ts         # All config types (RCTConfig, LangTestConfig, …)
│   ├── loader.ts        # loadConfig() — loads rct.config.{ts,js,json}
│   ├── schema.ts        # validateConfig(), applyPlugins() (async), desugarFileInjections()
│   ├── files.ts         # buildFileRegistry() — Map-based alias→content registry
│   ├── derive.ts        # deriveFromProject() — project detection and config derivation
│   └── index.ts         # Re-exports
├── engine/
│   ├── rules.ts         # evaluateRules() — block/warn decisions
│   ├── injections.ts    # evaluateInjections() — resolves FileRefs to content
│   ├── evaluate.ts      # evaluateMatch(), evaluateCondition(), globToRegex()
│   ├── meta.ts          # generateMeta() — config summary (reads from resolved config)
│   └── compose.ts       # composeOutput() — assembles final JSON output
├── lang/
│   ├── index.ts         # evaluateLang() — dispatches to per-language evaluators
│   ├── node.ts          # evaluateNode() — bun/npm/pnpm tools, tsconfig/jsconfig auto-discovery
│   ├── python.ts        # evaluatePython() — pixi/uv/pip tools
│   └── rust.ts          # evaluateRust() — cargo tools
├── tools/               # Low-level package-manager/build-tool extractors
│   ├── bun.ts           # getBunScripts(), getBunWorkspace()
│   ├── cargo.ts         # getCargoInfo() — sync Cargo.toml reader
│   ├── pixi.ts          # getPixiTasks(), getPixiEnvironment()
│   ├── npm.ts           # LangTool definition (config paths only)
│   ├── pnpm.ts          # LangTool definition (config paths only)
│   ├── pip.ts           # LangTool definition (config paths only)
│   └── uv.ts            # LangTool definition (config paths only)
├── lib/
│   ├── index.ts         # Library barrel: definePlugin, createHook, standard, dynamic, block
│   ├── plugin.ts        # definePlugin() — typed plugin authoring helper
│   ├── hook.ts          # createHook() — managed hook lifecycle wrapper
│   └── register.ts      # standard(), dynamic(), block() — low-level hook I/O helpers
├── plugin/
│   ├── types.ts         # RCTPlugin interface: { name, files?, rules? }
│   ├── index.ts         # Plugin registry (built-in plugins)
│   ├── resolve.ts       # Plugin resolution: built-in → local → package
│   ├── issueScope.ts    # Built-in "issue-scope" plugin
│   └── trackWork.ts     # Built-in "track-work" plugin
├── test/
│   └── runner.ts        # Per-language test execution, formatting, caching
├── constants.ts         # CLAUDE_PROJECT_DIR, LANGUAGES
├── util/
│   ├── fs.ts            # fs object: resolve, read, readRaw, write, mkdir, etc.; RCT_PREFIX
│   ├── xml.ts           # xml object: wrap(), open(), close(), inline(), attributes()
│   ├── general.ts       # normalize(), minify(), condense(), eventMatches(), matchesTool()
│   └── index.ts         # Re-exports
└── types.d.ts           # RC namespace; XML namespace; ReferenceFile; FileRegistry

rct.config.schema.json   # JSON Schema draft 2020-12 for rct.config.json
test/                    # 27 test files
```

### Path aliases

`tsconfig.json` maps `#*` → `./src/*`, so all internal imports use `#config/types`, `#engine/rules`, `#tools/bun`, `#lib/plugin`, etc.

## Key Data Flow

1. Claude Code fires a hook → `rct hook <HookEvent>` runs
2. Async events (PreToolUse, PostToolUse, …) receive a JSON payload on stdin
3. `cli/hook.ts` loads and validates `rct.config.{ts,js,json}` from `CLAUDE_PROJECT_DIR`
4. **Rules** evaluated first — `action: "block"` outputs `{ decision: "block", reason }` and exits 2
5. **Injections** evaluated — matching entries resolve `FileRef[]` from the registry
6. **Lang** evaluated — per-language modules (node/python/rust) extract tool info and config paths
7. **Test** runner invoked per language with top-level inheritance, results cached per session
8. **Meta** summary generated if configured (reads from resolved config, not hardcoded registry)
9. All parts assembled into `{ hookSpecificOutput: { hookEventName, additionalContext } }`, minified, written to stdout

## Config File (Consumer-Facing)

End users create `rct.config.json` (or `.ts`/`.js`) via `rct init`:

- `globals` — format (`xml`|`json`), wrapper tag, `briefByDefault`, `minify`, `plugins`
- `files` — register files with aliases; `injectOn` auto-creates injection entries
- `injections` — explicit injection rules: `{ on, match?, matchFile?, inject: FileRef[] }`
- `rules` — block/warn rules: `{ on, match, action, message }`
- `lang` — per-language declarations (`node`/`python`/`rust`) with `tools`, `config`, `test`
- `test` — top-level test defaults (`injectOn`, `cache`, `cacheTTL`); per-language overrides in `lang.*.test`
- `meta` — injects a summary of the config itself; supports `include` filtering
- `_derived` — stored derivation baseline for `rct update` three-way merge (auto-managed)

`FileRef` pattern: `alias[:metaAlias][~brief]` — references a registered file by alias, optionally selecting a meta-file and/or brief mode.

### Plugins

Plugins are declarative (contribute `files[]` and `rules[]`). Extensions are imperative (custom hook scripts using `createHook()` or `standard`/`dynamic`/`block`).

**Built-in plugins** (`globals.plugins`):
- **`track-work`** — registers `chores` (`dev/chores.xml`) and `plans` (`.claude/plans/index.xml`)
- **`issue-scope`** — registers `scope` (`.claude/context/scope.xml`, with stale check) and `candidates` (`.claude/context/issues.xml`)

**Custom plugins**: local files at `.claude/hooks/rct/*.{ts,js}` or npm packages. Use `definePlugin()` to author.

Plugin resolution chain: built-in name → local file (`.`/`/` prefix) → package name.

### Languages

`SupportedLanguage`: `node` | `python` | `rust`

The `node` language covers TypeScript and JavaScript. Config files (tsconfig.json, jsconfig.json) are auto-discovered if not explicitly declared.

### Per-language test config

Each `lang.*.test` field accepts `LangTestConfig`: `{ command?, brief?, format? }`. The top-level `test` config provides shared defaults (`injectOn`, `cache`, `cacheTTL`) inherited by each language.

### Hook events

`SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `SubagentStart`, `Notification`, `Setup`

### Match system

- **MatchTarget**: `file_path`, `new_string`, `content`, `command`, `user_prompt`, `tool_name`, `error`
- **MatchOperator**: `regex` (default), `contains`, `equals`, `not_contains`, `starts_with`, `ends_with`, `glob`
- Multiple conditions within a match array use AND logic; multiple patterns within a condition use OR logic
