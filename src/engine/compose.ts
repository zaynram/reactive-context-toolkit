import type { HookEvent, GlobalsConfig } from '#config/types'
import { minify, condense } from '#util/general'

export interface ComposeInput {
    event: HookEvent
    blockResult: { message: string } | null
    warnMessages: string[]
    injectionResults: string[]
    pluginContextResults?: string[]
    metaResult: string | null
    langResult: string | null
    testResult: string | null
    globals: Required<GlobalsConfig>
}

function resolveMinify(globals: Required<GlobalsConfig>): {
    enabled: boolean
    separator: string
    preserveNewlines: boolean
} {
    const m = globals.minify
    const format = globals.format
    // Default: xml strips newlines (tags are boundaries), json/other preserves them
    const defaultPreserveNewlines = format !== 'xml'

    if (m === false)
        return { enabled: false, separator: ' ', preserveNewlines: true }
    if (m === true || m === undefined)
        return {
            enabled: true,
            separator: ' ',
            preserveNewlines: defaultPreserveNewlines,
        }
    return {
        enabled: m.enabled !== false,
        separator: m.separator ?? ' ',
        preserveNewlines: m.preserveNewlines ?? defaultPreserveNewlines,
    }
}

export function composeOutput(input: ComposeInput): string {
    const {
        event,
        blockResult,
        warnMessages,
        injectionResults,
        pluginContextResults = [],
        metaResult,
        langResult,
        testResult,
        globals,
    } = input

    // Block path
    if (blockResult) {
        return minify(
            JSON.stringify({
                decision: 'block',
                reason: blockResult.message,
                hookSpecificOutput: { hookEventName: event },
            }),
        )
    }

    // Collect all context strings
    const parts: string[] = [
        ...injectionResults,
        ...pluginContextResults,
        ...warnMessages,
        ...(metaResult ? [metaResult] : []),
        ...(langResult ? [langResult] : []),
        ...(testResult ? [testResult] : []),
    ].filter((s) => s.length > 0)

    if (parts.length === 0) return ''

    let combined = parts.join('\n')

    // Apply content minification (condense whitespace for token efficiency)
    const { enabled, separator, preserveNewlines } = resolveMinify(globals)
    if (enabled) {
        combined = condense(combined, separator, preserveNewlines)
    }

    return minify(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: event,
                additionalContext: combined,
            },
        }),
    )
}
