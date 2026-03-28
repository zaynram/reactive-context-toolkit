# Reactive Context Toolkit v1 — Design Spec

> For agentic implementation: use `test-driven-development` and `subagent-driven-development` skills.

## Goal

A standalone TypeScript library (consumed via `bun`) that provides a typed, config-driven framework for building Claude Code hooks that inject reactive context. Extracted from and replacing daisy's `.claude/hooks/lib/` system.

## Architecture

RCT is a **hybrid library + framework**. Config-driven features handle the 80% case (file injection, PM tooling, validation rules, context templates). A typed API handles custom hook logic. A single hook runner entry point receives events from Claude Code, evaluates config, and outputs JSON.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict, ESNext)
- **Types:** `@anthropic-ai/claude-agent-sdk` for hook type definitions
- **Config:** `rct.config.ts` / `.js` / `.json` (resolution order)
- **Schema:** JSON Schema draft 2020-12 generated from TypeScript types

---

## Design Decisions (made on user's behalf)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Single entry point with event arg** (`rct-hook.js <EventName>`) | SessionStart has no stdin, so event must be known before stdin parsing. Single file is simpler to maintain than per-event scripts. `rct init` generates optimized matchers in settings.json. |
| D2 | **Config loading: `import()` for .ts/.js, `readFileSync` for .json** | Bun handles TS natively — no transpilation step. Dynamic import respects default exports. JSON is the fallback for non-bun environments. |
| D3 | **Fatal on config parse errors, graceful on runtime file-not-found** | Bad regex or invalid schema = crash at load (fail fast). Missing referenced file at runtime = skip silently (file may not exist yet in new projects). |
| D4 | **Cache is file-based, keyed by session_id** | Each hook invocation is a separate process — no in-memory persistence. Cache stored at `/tmp/rct-cache-{session_id}/`. Cleared on session end (or TTL expiry). |
| D5 | **Test command resolves from first lang tool with tasks/scripts enabled** | Declaration order in config determines priority. Documented explicitly to avoid ambiguity with multi-tool setups. |
| D6 | **Injection composition: array order, individual wrapping** | Multiple injections on same event concatenate in config array order. Each wrapped individually if different wrappers. Merged under shared wrapper if same. |
| D7 | **`file.injectOn` desugars to internal injection; explicit injection wins on dedup** | `injectOn: "SessionStart"` creates an implicit injection entry. If user also writes an explicit injection for same file+event, explicit wins (allows overriding wrapper/brief/format). Dedup by alias+event. |
| D8 | **Standalone `"schema"` metaFile reference is invalid** | MetaFiles must always use `"parent:meta"` colon notation. Bare metaFile alias is ambiguous when multiple parents share a metaFile alias. |
| D9 | **`rct init` generates settings.json matchers from config analysis** | Aggregates all tool names from rules/injections to create minimal, efficient matcher patterns. Avoids running hooks on every tool invocation. |
| D10 | **`staleCheck` is XML-only** | Date extraction uses regex against XML tags. JSON date detection is a different pattern and deferred to a future version. |
| D11 | **`meta.contents.enumeration` controls serialization style for injected content** | Four modes: `raw` (content only), `path` (path-labeled), `xml` (daisy-style `<references>`), `json` (path→content mapping). Default: `xml`. |
| D12 | **Regex patterns validated at config load time** | Invalid patterns cause a load error with context. Prevents silent failures at runtime. |

---

## Config Schema

Config file resolution order: `rct.config.ts` → `rct.config.js` → `rct.config.json`.

All paths are relative to `CLAUDE_PROJECT_DIR` (env var, falls back to `process.cwd()`).

### Top-Level Shape

```typescript
interface RCTConfig {
  globals?: GlobalsConfig
  files?: FileEntry[]
  lang?: LangConfig
  test?: boolean | string | TestConfig
  rules?: RuleEntry[]
  injections?: InjectionEntry[]
  meta?: MetaConfig
}
```

### Globals

```typescript
interface GlobalsConfig {
  format?: "xml" | "json"        // default: "xml"
  wrapper?: string               // default: "context"
  briefByDefault?: boolean       // default: false
}
```

### Files

```typescript
interface FileEntry {
  alias?: string                 // defaults to filename of path (e.g. "chores.xml")
  path: string                   // relative to CLAUDE_PROJECT_DIR
  injectOn?: HookEvent | HookEvent[]
  brief?: string                 // compact representation for token conservation
  staleCheck?: {
    dateTag: string              // XML tag containing YYYY-MM-DD
    wrapTag: string              // wrapper tag when stale
    format?: string              // date format, default "YYYY-MM-DD"
  }
  metaFiles?: MetaFileEntry[]
}

interface MetaFileEntry {
  alias?: string
  path: string
  injectOn?: HookEvent | HookEvent[]
  brief?: string
}
```

File registry is keyed by `alias ?? basename(path)`. MetaFiles are referenced via colon notation: `"parentAlias:metaAlias"`. The `~brief` suffix forces brief for a specific reference in injection entries.

### Lang

```typescript
interface LangConfig {
  typescript?: LangEntry
  javascript?: LangEntry
  python?: LangEntry
  rust?: LangEntry
}

interface LangEntry {
  tools?: LangTool[]
  config?: LangConfigFile[]
  injectOn?: HookEvent | HookEvent[]   // default: "SessionStart"
  format?: "xml" | "json"
}

interface LangTool {
  name: "bun" | "npm" | "pnpm" | "pixi" | "uv" | "pip" | "pipx" | "cargo" | "cargo-binstall" | "rustup"
  tasks?: boolean
  environment?: boolean
  workspace?: boolean
  scripts?: boolean
  manifest?: string              // override manifest path
  lockfile?: string              // override lockfile path
  config?: string                // override tool config path
  injectOn?: HookEvent | HookEvent[]
}

interface LangConfigFile {
  name: string                   // e.g. "tsconfig", "pyproject"
  path: string
  inject?: boolean               // inject content as orientation
  extractPaths?: boolean         // extract path aliases (tsconfig/jsconfig)
}
```

### Test

```typescript
interface TestConfig {
  command: true | string          // true = resolve from lang tools, string = verbatim
  injectOn?: HookEvent | HookEvent[]   // default: "SessionStart"
  cache?: boolean
  cacheTTL?: number              // seconds, default 300
  brief?: string                 // template: "{status}", "{passed}", "{failed}", "{total}"
  format?: "xml" | "json"
}
```

### Rules

```typescript
interface RuleEntry {
  enabled?: boolean              // default: true
  description?: string
  on: HookEvent
  matcher?: string               // pipe-delimited tool names
  match: MatchCondition | MatchCondition[]   // AND logic for arrays
  action: "block" | "warn"
  message: string
}

interface MatchCondition {
  target: "file_path" | "new_string" | "content" | "command" | "user_prompt" | "tool_name" | "error"
  operator?: "regex" | "contains" | "equals" | "not_contains" | "starts_with" | "ends_with" | "glob"  // default: "regex"
  pattern: string | (string | { name: string; path: string })[]
}
```

### Injections

```typescript
interface InjectionEntry {
  enabled?: boolean              // default: true
  description?: string
  on: HookEvent
  matcher?: string               // pipe-delimited tool names
  matchFile?: string             // file alias — trigger when this file is the target
  match?: MatchCondition | MatchCondition[]
  inject: FileRef[]              // e.g. ["chores", "chores:entry-schema", "scope~brief"]
  brief?: boolean                // default: false — use brief for all refs
  wrapper?: string               // overrides globals.wrapper
  format?: "xml" | "json"
}

type FileRef = string            // pattern: alias[:metaAlias][~brief]
```

### Meta

```typescript
interface MetaConfig {
  injectOn?: HookEvent | HookEvent[]   // default: "SessionStart"
  include?: ("files" | "lang" | "test" | "rules")[]   // default: ["files", "lang"]
  brief?: boolean                // default: true — compact manifest
  contents?: {
    enumeration?: "raw" | "path" | "xml" | "json"   // default: "xml"
  }
}
```

### Hook Events

```typescript
type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "SessionStart"
  | "UserPromptSubmit"
  | "Setup"
  | "SubagentStart"
  | "Notification"
```

Only events whose `HookSpecificOutput` includes `additionalContext`.

---

## Hook Runner Architecture

### Entry Point

Single script: `dist/hook.js <EventName>`

```
Claude Code settings.json
  → spawns: bun run ./node_modules/reactive-context-toolkit/dist/hook.js PreToolUse
  → hook.js reads event from argv[2]
  → loads rct.config.* (import for ts/js, readFileSync for json)
  → if sync event (SessionStart, Setup): evaluate and output immediately
  → if async event: read stdin JSON, evaluate rules/injections/files, output JSON
```

### Processing Pipeline

For each hook invocation:

1. **Load config** (cached in-process — only loaded once per invocation)
2. **Identify event** from CLI arg
3. **Read stdin** (if async event) and parse JSON
4. **Evaluate files** with `injectOn` matching this event
5. **Evaluate injections** matching this event + tool/file/content conditions
6. **Evaluate rules** matching this event + conditions
7. **Evaluate meta** if `injectOn` matches this event
8. **Evaluate lang/test** if their `injectOn` matches this event
9. **Compose output**: assemble `additionalContext` string from all matched injections, or `decision: "block"` from rules
10. **Output JSON** to stdout

### Output Priority

- If any rule matches with `action: "block"` → output block JSON, exit 2
- If any rule matches with `action: "warn"` → append message to additionalContext
- All matching injections → concatenate into additionalContext
- Output `{ hookSpecificOutput: { hookEventName, additionalContext } }`

---

## CLI: `rct init`

A bun script that:

1. Scans project for language files, PM tools, config files, reference files
2. Generates `rct.config.json` with auto-detected defaults (no rules/injections — those are intentional)
3. Merges hook entries into `.claude/settings.json` (preserving existing settings)
4. If `rct.config.*` already exists, only wires up settings.json hooks

### Settings.json Hook Generation

Analyzes config to produce optimized matchers:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bun run node_modules/reactive-context-toolkit/dist/hook.js SessionStart" }] }],
    "PreToolUse": [{ "matcher": "Write|Edit|MultiEdit|Bash|mcp__notion", "hooks": [{ "type": "command", "command": "bun run node_modules/reactive-context-toolkit/dist/hook.js PreToolUse" }] }],
    "PostToolUse": [{ "matcher": "Read", "hooks": [{ "type": "command", "command": "bun run node_modules/reactive-context-toolkit/dist/hook.js PostToolUse" }] }]
  }
}
```

Matchers are derived from: `rules[].matcher`, `injections[].matcher`, and any `injections[].matchFile` (which implies the tool that reads files = "Read").

---

## Package Exports (src/index.ts)

Consumer-facing API:

```typescript
// Config
export { config, CLAUDE_PROJECT_DIR } from "./config/index"
export type { RCTConfig, FileEntry, RuleEntry, InjectionEntry, ... } from "./config/types"

// Register (hook output helpers)
export { standard, dynamic, block } from "./register"

// Files
export { files } from "./config/files"
export type { ReferenceFile } from "./config/files"

// Utilities
export { fs } from "./util/fs"
export { xml } from "./util/xml"
export { minify, normalize } from "./util/general"
```

---

## JSON Schema

A full JSON Schema (draft 2020-12) will be generated from the `RCTConfig` TypeScript type and published at the package root as `rct.config.schema.json`. It will include:

- `$defs` for all shared types (HookEvent, MatchCondition, FileRef, etc.)
- `anyOf`/`oneOf` constraints for union types
- `required` properties
- `additionalProperties: false` on all objects
- `enum` constraints on string literals
- `pattern` constraints on FileRef strings
- `default` values where applicable

The schema `$id` will be set to enable `$schema` references in consumer configs.
