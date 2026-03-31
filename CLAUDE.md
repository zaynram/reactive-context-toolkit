# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using MCP Task Orchestrator with Superpowers

Always read the usage directives outlined in [mcp-task-orchestrator-and-superpowers.md](.claude/rules/mcp-task-orchestrator-and-superpowers.md) before starting any development work.

## What This Project Is

**Reactive Context Toolkit (RCT)** is a TypeScript/Bun library that acts as a Claude Code hook handler. Consumers install it, run `bunx rct init` to scaffold an `rct.config.json` and patch their `.claude/settings.json`, and the hook script at `dist/hook.js` gets invoked by Claude Code on every configured hook event. Based on the event and match conditions in the config, it injects XML context into Claude's prompt, blocks or warns on matched tool use, surfaces language-ecosystem info (scripts, tasks, path aliases), and runs tests.

## Commands

```sh
bun install                                        # install dependencies
bun run build                                      # build dist/hook.js (hook subprocess)
bun test                                           # run all tests (20 test files in test/)
bun test <pattern>                                 # run a single test file or matching tests
bun run src/cli/index.ts hook <HookEvent>          # run the hook entrypoint manually
```

`@anthropic-ai/claude-agent-sdk` is the dev dependency that provides the `RC` namespace types used in `src/types.d.ts` for hook I/O shapes. There are no production dependencies.

## Architecture

```
src/
├── index.ts             # Public barrel: exports all config, engine, lang, test, util, plugin symbols
├── cli/
│   ├── index.ts         # rct CLI dispatcher: routes `rct init` and `rct hook <event>`
│   ├── hook.ts          # Hook entrypoint: reads event from argv[2], stdin payload,
│   │                    # orchestrates all evaluation, writes JSON to stdout
│   └── init.ts          # initializeRCT(): detectProject() (sync), writes rct.config.json,
│                        # patches .claude/settings.json with hook commands
├── plugin/
│   ├── index.ts         # Plugin registry (maps name → RCTPlugin)
│   ├── types.ts         # RCTPlugin interface: { name, files?, rules? }
│   ├── public.ts        # getSchemaPath(), createFromTemplate() — public asset helpers
│   ├── issueScope.ts    # Built-in "issue-scope" plugin
│   └── trackWork.ts     # Built-in "track-work" plugin
├── config/
│   ├── loader.ts        # loadConfig() — loads rct.config.{json,ts,js} from CLAUDE_PROJECT_DIR
│   ├── schema.ts        # validateConfig(), applyPlugins(), desugarFileInjections(), applyStaleCheck()
│   ├── types.ts         # All RCT config types (RCTConfig, InjectionEntry, RuleEntry, …)
│   ├── files.ts         # buildFileRegistry() — resolves FileEntry paths to content
│   └── index.ts         # Re-exports from loader, schema, files, types
├── engine/
│   ├── rules.ts         # evaluateRules() — block/warn decisions
│   ├── injections.ts    # evaluateInjections() — selects and renders FileRefs
│   ├── evaluate.ts      # evaluateMatch() / evaluateCondition() — match operators
│   ├── meta.ts          # generateMeta() — injects RCT config summary as XML
│   └── compose.ts       # composeOutput() — assembles final JSON for Claude Code
├── lang/
│   ├── index.ts         # evaluateLang(lang,event,cwd,globals) — dispatches to tools; extractTsconfigPaths()
│   ├── bun.ts           # Re-exports getBunScripts, getBunWorkspace from #tools/bun
│   ├── cargo.ts         # Re-exports getCargoInfo from #tools/cargo
│   └── pixi.ts          # Re-exports getPixiTasks, getPixiEnvironment from #tools/pixi
├── tools/
│   ├── index.ts         # LangTool registry — per-language tool detection (filters by file existence)
│   ├── bun.ts           # LangTool def + getBunScripts(tool,cwd), getBunWorkspace(tool,cwd)
│   ├── cargo.ts         # LangTool def + getCargoInfo(tool,cwd) — sync Cargo.toml reader
│   ├── clippy.ts        # LangTool definition
│   ├── npm.ts           # LangTool definition
│   ├── pip.ts           # LangTool definition
│   ├── pixi.ts          # LangTool def + getPixiTasks(tool,cwd), getPixiEnvironment(tool,cwd)
│   ├── pnpm.ts          # LangTool definition
│   ├── ruff.ts          # LangTool definition
│   └── uv.ts            # LangTool definition
├── test/
│   └── runner.ts        # resolveTestCommand(), runTest(), formatTestResult(), cache
├── register.ts          # standard() / dynamic() / block() typed output helpers
├── constants.ts         # CLAUDE_PROJECT_DIR, RCT_PREFIX, LANGUAGES
├── util/
│   ├── xml.ts           # xml.open(), xml.close(), xml.inline(), xml.escape()
│   ├── fs.ts            # fs helpers: resolve, read, config, manifest, source, stem
│   └── general.ts       # normalize(), minify(), condense(), matchesTool()
└── types.d.ts           # RC namespace type declarations for hook I/O; ReferenceFile, FileRegistry

rct.config.schema.json   # JSON Schema draft 2020-12 for rct.config.json
test/                    # 20 test files (config, engine, lang, integration, init, compose)
docs/specs/              # Design specs written before implementation
```

## Key Data Flow

1. Claude Code fires a hook → `rct hook <HookEvent>` runs (via `bun run rct hook`)
2. Async events (PreToolUse, PostToolUse, …) receive a JSON payload on stdin with `tool_name`, `file_path`, etc.
3. `cli/hook.ts` loads and validates `rct.config.{json,ts,js}` from `CLAUDE_PROJECT_DIR`
4. **Rules** are evaluated first — if a rule matches and is `action: "block"`, the hook outputs `{ decision: "block", reason: "…" }` and exits 2
5. **Injections** are evaluated — matching `InjectionEntry` items render their `FileRef[]` as XML
6. **Lang** block is evaluated — pixi tasks, bun scripts, cargo info, tsconfig path aliases are rendered as XML
7. **Test** runner is invoked if configured and the event matches `injectOn`
8. **Meta** summary of the config is generated if configured
9. All parts assembled into `{ hookSpecificOutput: { hookEventName, additionalContext } }` and minified to stdout

## Config File (Consumer-Facing)

End users create `rct.config.json` (or `.ts`/`.js`) in their project. Key sections:

- `files` — files with aliases; `injectOn` auto-creates injection entries
- `injections` — explicit injection rules: `{ on, match?, matchFile?, inject: FileRef[] }`
- `rules` — block/warn rules: `{ on, match, action, message }`
- `lang` — per-language tool declarations (typescript/python/rust) with tools and config files
- `test` — test command config with optional caching
- `meta` — injects a summary of the config itself as XML
- `globals.plugins` — activates built-in plugins (`"track-work"`, `"issue-scope"`); plugins contribute additional `files` and `rules` merged at evaluation time

`FileRef` pattern: `alias[:metaAlias][~brief]` — references a registered file by alias, optionally selecting a meta-file and/or brief mode.
