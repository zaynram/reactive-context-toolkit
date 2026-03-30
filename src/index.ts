// Config
export * from "#constants"
export { loadConfig } from "#config/loader"
export {
    validateConfig,
    desugarFileInjections,
    applyPlugins,
} from "#config/schema"
export { buildFileRegistry } from "#config/files"
export type { ReferenceFile, FileRegistry } from "#types"
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
    RuleEntry,
    MatchCondition,
    InjectionEntry,
    MetaConfig,
    HookEvent,
    FileRef,
    Match,
    MatchTarget,
    MatchOperator,
} from "#config/types"

// Engine
export { evaluateRules } from "#engine/rules"
export { evaluateInjections } from "#engine/injections"
export { evaluateMatch, evaluateCondition } from "#engine/evaluate"
export { generateMeta } from "#engine/meta"
export { composeOutput } from "#engine/compose"

// Lang
export { evaluateLang } from "#lang"

// Test
export { resolveTestCommand, runTest, formatTestResult } from "#test/runner"

// Register (existing typed hook output helpers)
export { standard, dynamic, block } from "#register"

// Utilities
export { fs } from "#util/fs"
export { xml } from "#util/xml"
export { normalize, minify, condense } from "#util/general"

// Plugin
export type { RCTPlugin } from "#plugin/types"
export { default as pluginRegistry } from "#plugin/index"
