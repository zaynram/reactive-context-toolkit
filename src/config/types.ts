/**
 * RCT (Reactive Context Toolkit) configuration type definitions.
 * Defines the shape of rct.config.json / rct.config.ts / rct.config.js
 */

/** Hook events that support additionalContext */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "SessionStart"
  | "UserPromptSubmit"
  | "Setup"
  | "SubagentStart"
  | "Notification"

/** A single hook event or an array of hook events */
export type HookEventOrArray = HookEvent | HookEvent[]

/** Output format for injected context */
export type Format = "xml" | "json"

/**
 * FileRef pattern: alias[:metaAlias][~brief]
 * A string reference to a file entry by its alias, optionally
 * selecting a meta-alias and/or requesting brief mode.
 */
export type FileRef = string

/** Minification configuration */
export interface MinifyConfig {
  /** Whether minification is enabled (default: true) */
  enabled?: boolean
  /** Whitespace separator used when condensing (default: " ") */
  separator?: string
}

/** Global configuration defaults */
export interface GlobalsConfig {
  /** Output format (default: "xml") */
  format?: Format
  /** Wrapper tag name (default: "context") */
  wrapper?: string
  /** Whether files are injected in brief mode by default (default: false) */
  briefByDefault?: boolean
  /** Minification of injected content (default: true). All whitespace runs condensed to separator. */
  minify?: boolean | MinifyConfig
}

/** A meta-file entry attached to a parent FileEntry */
export interface MetaFileEntry {
  /** Optional alias for referencing this meta-file */
  alias?: string
  /** Path to the file (absolute or relative to project root) */
  path: string
  /** Hook event(s) that trigger injection of this meta-file */
  injectOn?: HookEventOrArray
  /** Brief/summary content to inject instead of full file */
  brief?: string
}

/** A file entry in the config, extending MetaFileEntry with staleness and meta-files */
export interface FileEntry extends MetaFileEntry {
  /** Staleness check configuration */
  staleCheck?: {
    /** Tag name containing the date */
    dateTag: string
    /** Tag name wrapping the content */
    wrapTag: string
    /** Date format string */
    format?: string
  }
  /** Associated meta-files */
  metaFiles?: MetaFileEntry[]
}

/** Targets for match conditions */
export type MatchTarget =
  | "file_path"
  | "new_string"
  | "content"
  | "command"
  | "user_prompt"
  | "tool_name"
  | "error"

/** Operators for match conditions */
export type MatchOperator =
  | "regex"
  | "contains"
  | "equals"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "glob"

/** A single match condition */
export interface MatchCondition {
  /** What to match against */
  target: MatchTarget
  /** How to match (default: "regex") */
  operator?: MatchOperator
  /** Pattern(s) to match -- string or array of strings/objects */
  pattern: string | (string | { name: string; path: string })[]
}

/** A match specification: single condition or array of conditions */
export type Match = MatchCondition | MatchCondition[]

/** A rule entry that blocks or warns on matched tool usage */
export interface RuleEntry {
  /** Whether this rule is active (default: true) */
  enabled?: boolean
  /** Human-readable description */
  description?: string
  /** Hook event this rule applies to */
  on: HookEvent
  /** Pipe-delimited tool name matcher */
  matcher?: string
  /** Match condition(s) */
  match: Match
  /** Action to take on match */
  action: "block" | "warn"
  /** Message to display */
  message: string
}

/** An injection entry that injects file content on matched events */
export interface InjectionEntry {
  /** Whether this injection is active */
  enabled?: boolean
  /** Human-readable description */
  description?: string
  /** Hook event this injection applies to */
  on: HookEvent
  /** Pipe-delimited tool name matcher */
  matcher?: string
  /** Glob pattern to match file paths */
  matchFile?: string
  /** Additional match condition(s) */
  match?: Match
  /** File references to inject */
  inject: FileRef[]
  /** Whether to inject in brief mode */
  brief?: boolean
  /** Custom wrapper tag */
  wrapper?: string
  /** Output format override */
  format?: Format
  /** Override global minification for this injection (default: inherit from globals) */
  minify?: boolean
}

/** A language-specific config file to track */
export interface LangConfigFile {
  /** Display name */
  name: string
  /** Path to the config file */
  path: string
  /** Whether to inject this config file's content */
  inject?: boolean
  /** Whether to extract paths from this config */
  extractPaths?: boolean
}

/** Known language tool names */
export type LangToolName =
  | "bun"
  | "npm"
  | "pnpm"
  | "pixi"
  | "uv"
  | "pip"
  | "pipx"
  | "cargo"
  | "cargo-binstall"
  | "rustup"

/** Configuration for a language tool */
export interface LangTool {
  /** Tool identifier */
  name: LangToolName
  /** Whether to inject task runner info */
  tasks?: boolean
  /** Whether to inject environment info */
  environment?: boolean
  /** Whether to inject workspace info */
  workspace?: boolean
  /** Whether to inject scripts info */
  scripts?: boolean
  /** Path to manifest file */
  manifest?: string
  /** Path to lockfile */
  lockfile?: string
  /** Path to tool config file */
  config?: string
  /** Hook event(s) that trigger injection */
  injectOn?: HookEventOrArray
}

/** Configuration for a language ecosystem */
export interface LangEntry {
  /** Language tools to configure */
  tools?: LangTool[]
  /** Config files to track */
  config?: LangConfigFile[]
  /** Hook event(s) that trigger injection */
  injectOn?: HookEventOrArray
  /** Output format override */
  format?: Format
}

/** Language-specific configurations keyed by language name */
export interface LangConfig {
  typescript?: LangEntry
  javascript?: LangEntry
  python?: LangEntry
  rust?: LangEntry
}

/** Test runner configuration */
export interface TestConfig {
  /** Test command to run (true = auto-detect) */
  command: true | string
  /** Hook event(s) that trigger test injection */
  injectOn?: HookEventOrArray
  /** Whether to cache test results */
  cache?: boolean
  /** Cache TTL in seconds */
  cacheTTL?: number
  /** Brief summary of test results */
  brief?: string
  /** Output format override */
  format?: Format
}

/** Meta-configuration for the config itself */
export interface MetaConfig {
  /** Hook event(s) that trigger meta injection */
  injectOn?: HookEventOrArray
  /** Which config sections to include in meta output */
  include?: ("files" | "lang" | "test" | "rules")[]
  /** Whether to use brief mode */
  brief?: boolean
  /** Content enumeration settings */
  contents?: {
    /** How to enumerate contents */
    enumeration?: "raw" | "path" | "xml" | "json"
  }
}

/** Top-level RCT configuration */
export interface RCTConfig {
  /** Global defaults */
  globals?: GlobalsConfig
  /** File entries for context injection */
  files?: FileEntry[]
  /** Language ecosystem configurations */
  lang?: LangConfig
  /** Test runner config (boolean, command string, or full config) */
  test?: boolean | string | TestConfig
  /** Rules for blocking/warning on tool usage */
  rules?: RuleEntry[]
  /** Context injection definitions */
  injections?: InjectionEntry[]
  /** Meta-configuration */
  meta?: MetaConfig
}
