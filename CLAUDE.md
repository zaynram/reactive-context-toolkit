# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using MCP Task Orchestrator with Superpowers

Always read the usage directives outlined in [mcp-task-orchestrator-and-superpowers.md](.claude/rules/mcp-task-orchestrator-and-superpowers.md) before starting any development work.

## What This Project Is

**Reactive Context Toolkit (RCT)** is a zero-dependency TypeScript/Bun library that acts as a Claude Code hook handler. Consumers install it, run `bunx rct init` to scaffold an `rct.config.json` and patch their `.claude/settings.json`, and the hook subprocess (`dist/rct.js`) runs on every configured hook event. Based on the event and match conditions in the config, it injects context (XML or JSON) into Claude's prompt, blocks or warns on matched tool use, surfaces language-ecosystem info (scripts, tasks, path aliases), and runs tests.

## Commands

```sh
bun install                   # install dependencies
bun run build                 # build dist/rct.js (bundled hook subprocess)
bun test                      # run all tests (21 test files in test/)
bun test <pattern>            # run a single test file or matching tests
bun lint                      # lint with oxlint
bun lint:fix                  # lint and auto-fix
bun format                    # format with prettier
bun check                     # format + lint:fix + test (runs on postinstall)
```

### Dev dependencies

- `@anthropic-ai/claude-agent-sdk` — provides `RC` namespace types for hook I/O shapes (`src/types.d.ts`)
- `oxlint` + `oxlint-tsgolint` — linting
- `bun-types` — Bun runtime type declarations

## Architecture

```
src/
├── index.ts             # Public barrel export
├── cli/
│   ├── index.ts         # CLI dispatcher: routes `rct init` and `rct hook <event>`
│   ├── hook.ts          # Hook entrypoint: reads event + stdin payload, orchestrates
│   │                    # evaluation pipeline, writes JSON to stdout
│   └── init.ts          # detectProject(), generateConfig(), mergeSettings()
├── config/
│   ├── types.ts         # All config types (RCTConfig, InjectionEntry, RuleEntry, …)
│   ├── loader.ts        # loadConfig() — loads rct.config.{ts,js,json}
│   ├── schema.ts        # validateConfig(), applyPlugins(), desugarFileInjections(), applyStaleCheck()
│   ├── files.ts         # buildFileRegistry() — Map-based alias→content registry
│   └── index.ts         # Re-exports
├── engine/
│   ├── rules.ts         # evaluateRules() — block/warn decisions
│   ├── injections.ts    # evaluateInjections() — resolves FileRefs to content
│   ├── evaluate.ts      # evaluateMatch(), evaluateCondition(), globToRegex()
│   ├── meta.ts          # generateMeta() — config summary in xml/json/path/raw formats
│   └── compose.ts       # composeOutput() — assembles final JSON output
├── lang/
│   ├── index.ts         # evaluateLang() — dispatches to tools; extractTsconfigPaths()
│   ├── bun.ts           # Re-exports from #tools/bun
│   ├── cargo.ts         # Re-exports from #tools/cargo
│   └── pixi.ts          # Re-exports from #tools/pixi
├── tools/               # Package-manager/build-tool extractors only
│   ├── bun.ts           # LangTool def + getBunScripts(), getBunWorkspace()
│   ├── cargo.ts         # LangTool def + getCargoInfo() — sync Cargo.toml reader
│   ├── pixi.ts          # LangTool def + getPixiTasks(), getPixiEnvironment()
│   ├── npm.ts           # LangTool definition (config paths only)
│   ├── pnpm.ts          # LangTool definition (config paths only)
│   ├── pip.ts           # LangTool definition (config paths only)
│   └── uv.ts            # LangTool definition (config paths only)
├── plugin/
│   ├── types.ts         # RCTPlugin interface: { name, files?, rules? }
│   ├── index.ts         # Plugin registry (maps name → RCTPlugin instance)
│   ├── public.ts        # getSchemaPath(), createFromTemplate()
│   ├── issueScope.ts    # Built-in "issue-scope" plugin
│   └── trackWork.ts     # Built-in "track-work" plugin
├── test/
│   └── runner.ts        # resolveTestCommand(), runTest(), formatTestResult(), caching
├── register.ts          # standard(), dynamic(), block() — typed hook output helpers
├── constants.ts         # CLAUDE_PROJECT_DIR, LANGUAGES
├── util/
│   ├── fs.ts            # fs object: resolve, read, readRaw, write, mkdir, join, isAbsolute, exists, dir, name, stem, source, config; also exports RCT_PREFIX
│   ├── xml.ts           # xml object: wrap(), open(), close(), inline(), attributes()
│   ├── general.ts       # normalize(), minify(), condense(), entries(), matchesTool()
│   └── index.ts         # Re-exports from fs, xml, general
└── types.d.ts           # RC namespace (HookEvent, HookInput, HookSpecificOutput, HookJSONOutput);
                         # XML namespace; ReferenceFile; FileRegistry

rct.config.schema.json   # JSON Schema draft 2020-12 for rct.config.json
test/                    # 21 test files covering config, engine, lang, tools, plugins, CLI, integration
```

### Path aliases

`tsconfig.json` maps `#*` → `./src/*`, so all internal imports use `#config/types`, `#engine/rules`, `#tools/bun`, etc.

## Key Data Flow

1. Claude Code fires a hook → `rct hook <HookEvent>` runs
2. Async events (PreToolUse, PostToolUse, …) receive a JSON payload on stdin
3. `cli/hook.ts` loads and validates `rct.config.{ts,js,json}` from `CLAUDE_PROJECT_DIR`
4. **Rules** evaluated first — `action: "block"` outputs `{ decision: "block", reason }` and exits 2
5. **Injections** evaluated — matching entries resolve `FileRef[]` from the registry
6. **Lang** evaluated — pixi tasks, bun scripts, cargo info, tsconfig path aliases
7. **Test** runner invoked if configured and event matches `injectOn`
8. **Meta** summary generated if configured
9. All parts assembled into `{ hookSpecificOutput: { hookEventName, additionalContext } }`, minified, written to stdout

## Config File (Consumer-Facing)

End users create `rct.config.json` (or `.ts`/`.js`) in their project:

- `globals` — format (`xml`|`json`), wrapper tag, `briefByDefault`, `minify`, `plugins`
- `files` — register files with aliases; `injectOn` auto-creates injection entries
- `injections` — explicit injection rules: `{ on, match?, matchFile?, inject: FileRef[] }`
- `rules` — block/warn rules: `{ on, match, action, message }`
- `lang` — per-language declarations (typescript/python/rust) with `tools` and `config`
- `test` — test command config with optional caching (`cache`, `cacheTTL`)
- `meta` — injects a summary of the config itself; supports `include` filtering

`FileRef` pattern: `alias[:metaAlias][~brief]` — references a registered file by alias, optionally selecting a meta-file and/or brief mode.

### Plugins

Built-in plugins (`globals.plugins`):

- **`track-work`** — registers `chores` (`dev/chores.xml`) and `plans` (`.claude/plans/index.xml`)
- **`issue-scope`** — registers `scope` (`.claude/context/scope.xml`, with stale check) and `candidates` (`.claude/context/issues.xml`)

Plugins contribute `files[]` and `rules[]` that are merged into the config at evaluation time via `applyPlugins()`.

### Hook events

`SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `SubagentStart`, `Notification`, `Setup`

### Match system

- **MatchTarget**: `file_path`, `new_string`, `content`, `command`, `user_prompt`, `tool_name`, `error`
- **MatchOperator**: `regex` (default), `contains`, `equals`, `not_contains`, `starts_with`, `ends_with`, `glob`
- Multiple conditions within a match array use AND logic; multiple patterns within a condition use OR logic
