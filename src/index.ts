// Config

/** The resolved CLAUDE_PROJECT_DIR and list of supported languages. */
export * from '#constants'

/** Load and parse rct.config.{json,ts,js} from CLAUDE_PROJECT_DIR. */
export { loadConfig } from '#config/loader'

/** Validate config regex patterns, populate defaults, and expand shorthand. Composable for custom pipelines. */
export {
    validateConfig,
    desugarFileInjections,
    applyPlugins,
} from '#config/schema'
export type { PluginExtensions, ApplyPluginsResult } from '#config/schema'

/** Build the alias-to-content Map used by injections and meta. Composable for custom pipelines. */
export { buildFileRegistry } from '#config/files'

/** Derive a fully-populated config from project file detection. Used by rct init/update. */
export { deriveFromProject } from '#config/derive'

export type { ReferenceFile, FileRegistry } from '#types'

// Types
export type {
    RCTConfig,
    GlobalsConfig,
    FileEntry,
    MetaFileEntry,
    LangConfig,
    LangEntry,
    LangTool,
    LangConfigFile,
    TestConfig,
    LangTestConfig,
    RuleEntry,
    MatchCondition,
    InjectionEntry,
    MetaConfig,
    HookEvent,
    FileRef,
    Match,
    MatchTarget,
    MatchOperator,
} from '#config/types'

// Engine

/** Evaluate rule entries against a hook payload; returns block/warn decisions. Composable for custom pipelines. */
export { evaluateRules } from '#engine/rules'

/** Resolve matching injection entries into file content strings. Composable for custom pipelines. */
export { evaluateInjections } from '#engine/injections'

/** Low-level match helpers: test a full Match array or a single MatchCondition against input. */
export { evaluateMatch, evaluateCondition } from '#engine/evaluate'

/** Generate a meta summary of the active config in xml/json/path/raw format. */
export { generateMeta } from '#engine/meta'

/** Assemble rules, injections, lang, test, and meta results into the final hook JSON output. */
export { composeOutput } from '#engine/compose'

// Lang

/** Detect and extract language-ecosystem info (scripts, tasks, path aliases) for configured tools. */
export { evaluateLang } from '#lang'

// Test

/** Resolve the test command string from config, optionally filtered by language. */
export {
    resolveTestCommand,
    resolveLangTestCommand,
    runTest,
    formatTestResult,
} from '#test/runner'

// Library surface (typed hook output helpers + extension API)

/**
 * Typed hook output helpers for writing custom hooks.
 * - `standard` — write a successful hook JSON response to stdout and exit 0.
 * - `dynamic` — parse stdin into a typed HookInput promise for ad-hoc processing.
 * - `block` — write a block decision to stdout and exit 2.
 */
export { standard, dynamic, block } from '#lib/register'

/**
 * Define a plugin for RCT. Validates the plugin shape at compile time
 * and resolves relative file paths against process.cwd().
 * @example
 * export default definePlugin({ name: 'my-plugin', files: [...], rules: [...] })
 */
export { definePlugin } from '#lib/plugin'

/**
 * Create a managed hook handler. Handles stdin parsing, handler invocation,
 * stdout formatting, and exit codes. The recommended way to write custom hooks.
 * @example
 * createHook(async (input) => {
 *     return { hookSpecificOutput: { additionalContext: 'Hello' } }
 * })
 */
export { createHook } from '#lib/hook'

// Utilities

/** File-system helpers: resolve, read, write, exists, join, dir, etc. All paths resolve from CLAUDE_PROJECT_DIR. */
export { fs } from '#util/fs'

/** XML builder helpers: wrap(), open(), close(), inline(), attributes(). */
export { xml } from '#util/xml'

/** String utilities: normalize whitespace, minify JSON strings, condense blank lines. */
export { normalize, minify, condense } from '#util/general'

// Plugin

export type {
    RCTPlugin,
    PluginHookInput,
    PluginTriggerResult,
} from '#plugin/types'
export { displayName } from '#plugin/types'

/** Registry mapping plugin names to their RCTPlugin instances. */
export { default as pluginRegistry } from '#plugin/index'
