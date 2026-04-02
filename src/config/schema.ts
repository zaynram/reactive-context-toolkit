import { fs } from '#util/fs'
import { resolvePlugin } from '#plugin/resolve'
import type { RCTPlugin } from '#plugin/types'
import type {
    RCTConfig,
    GlobalsConfig,
    MatchCondition,
    Match,
    HookEvent,
    InjectionEntry,
    FileEntry,
    RuleEntry,
} from './types'

export interface PluginExtensions {
    contexts: Array<{ name: string; fn: NonNullable<RCTPlugin['context']> }>
    triggers: Array<{ name: string; fn: NonNullable<RCTPlugin['trigger']> }>
}

export interface ApplyPluginsResult {
    config: ValidatedConfig
    extensions: PluginExtensions
}

export type ValidatedConfig = { globals: Required<GlobalsConfig> } & RCTConfig

const DEFAULT_GLOBALS: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}

function validateRegex(pattern: string, context: string): void {
    try {
        new RegExp(pattern)
    } catch {
        throw new Error(`Invalid regex pattern in ${context}: ${pattern}`)
    }
}

function validateMatchCondition(
    condition: MatchCondition,
    context: string,
): void {
    const operator = condition.operator ?? 'regex'
    if (operator === 'regex' && typeof condition.pattern === 'string') {
        validateRegex(condition.pattern, context)
    }
    if (operator === 'regex' && Array.isArray(condition.pattern)) {
        for (const p of condition.pattern) {
            if (typeof p === 'string') {
                validateRegex(p, context)
            }
        }
    }
}

function validateMatch(match: Match | undefined, context: string): void {
    if (!match) return
    const conditions = Array.isArray(match) ? match : [match]
    for (const cond of conditions) {
        validateMatchCondition(cond, context)
    }
}

const LEGACY_LANG_KEYS = ['typescript', 'javascript'] as const

export function validateConfig(config: RCTConfig): ValidatedConfig {
    // Warn on legacy language keys
    if (config.lang) {
        for (const key of LEGACY_LANG_KEYS) {
            if (key in config.lang) {
                console.warn(
                    `[rct] lang.${key} is deprecated in v1.0.0. Rename to lang.node.`,
                )
            }
        }
    }

    // Validate rules
    if (config.rules) {
        for (const rule of config.rules) {
            validateMatch(
                rule.match,
                `rule "${rule.description ?? rule.message}"`,
            )
        }
    }

    // Validate injections
    if (config.injections) {
        for (const injection of config.injections) {
            validateMatch(
                injection.match,
                `injection "${injection.description ?? 'unnamed'}"`,
            )
        }
    }

    // Populate defaults
    const globals: Required<GlobalsConfig> = {
        ...DEFAULT_GLOBALS,
        ...config.globals,
    }

    return { ...config, globals }
}

export async function applyPlugins(
    config: ValidatedConfig,
): Promise<ApplyPluginsResult> {
    const extensions: PluginExtensions = { contexts: [], triggers: [] }
    const pluginNames = config.globals.plugins ?? []
    if (pluginNames.length === 0) return { config, extensions }

    const mergedFiles: FileEntry[] = [...(config.files ?? [])]
    const mergedRules: RuleEntry[] = [...(config.rules ?? [])]
    const hadRules = config.rules?.length ?? 0

    for (const name of pluginNames) {
        try {
            const { plugin } = await resolvePlugin(name)
            if (plugin.files) mergedFiles.push(...plugin.files)
            if (plugin.rules) mergedRules.push(...plugin.rules)
            if (plugin.context)
                extensions.contexts.push({
                    name: plugin.name ?? name,
                    fn: plugin.context,
                })
            if (plugin.trigger)
                extensions.triggers.push({
                    name: plugin.name ?? name,
                    fn: plugin.trigger,
                })
        } catch (err) {
            console.warn(
                `[rct] Warning: Failed to resolve plugin '${name}': ${err instanceof Error ? err.message : String(err)}`,
            )
            if (process.env.RCT_DEBUG && err instanceof Error && err.stack) {
                console.warn(err.stack)
            }
        }
    }

    const merged: ValidatedConfig = {
        ...config,
        files: mergedFiles,
        rules: mergedRules.length > hadRules ? mergedRules : config.rules,
    }

    return { config: merged, extensions }
}

export function desugarFileInjections(
    config: ValidatedConfig,
): ValidatedConfig {
    const files = config.files ?? []
    const existingInjections = [...(config.injections ?? [])]
    const newInjections: InjectionEntry[] = []

    for (const file of files) {
        const alias = file.alias ?? fs.stem(file.path)

        // Desugar file-level injectOn
        if (file.injectOn) {
            const events: HookEvent[] =
                Array.isArray(file.injectOn) ? file.injectOn : [file.injectOn]

            for (const event of events) {
                const alreadyExists = existingInjections.some(
                    (inj) => inj.on === event && inj.inject.includes(alias),
                )
                if (!alreadyExists) {
                    newInjections.push({ on: event, inject: [alias] })
                }
            }
        }

        // Desugar metaFile-level injectOn
        if (file.metaFiles) {
            for (const meta of file.metaFiles) {
                if (!meta.injectOn) continue
                const metaAlias = meta.alias ?? fs.stem(meta.path)
                const colonRef = `${alias}:${metaAlias}`
                const events: HookEvent[] =
                    Array.isArray(meta.injectOn) ?
                        meta.injectOn
                    :   [meta.injectOn]

                for (const event of events) {
                    const alreadyExists = existingInjections.some(
                        (inj) =>
                            inj.on === event && inj.inject.includes(colonRef),
                    )
                    if (!alreadyExists) {
                        newInjections.push({ on: event, inject: [colonRef] })
                    }
                }
            }
        }
    }

    return { ...config, injections: [...existingInjections, ...newInjections] }
}

export function applyStaleCheck(
    content: string,
    staleConfig: { dateTag: string; wrapTag: string },
    today: string,
): string {
    const dateRegex = new RegExp(
        `<${staleConfig.dateTag}>(\\d{4}-\\d{2}-\\d{2})</${staleConfig.dateTag}>`,
    )
    const match = dateRegex.exec(content)
    if (!match) return content

    const extractedDate = match[1]
    // Compare dates as strings (YYYY-MM-DD format is lexicographically comparable)
    if (extractedDate >= today) return content

    return `<${staleConfig.wrapTag} date="${extractedDate}" today="${today}">${content}</${staleConfig.wrapTag}>`
}
