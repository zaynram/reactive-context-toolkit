import type { HookEvent, GlobalsConfig } from '#config/types'
import { minify, condense } from '#util/general'

export type ComposeInput =
    | {
          event: HookEvent
          warnMessages: string[]
          injectionResults: string[]
          pluginContextResults?: string[]
          metaResult: string | null
          langResult: string | null
          testResult: string | null
          globals: Required<GlobalsConfig>
      }
    | { blockResult: { message: string } }

function resolveMinify(globals: Required<GlobalsConfig>): {
    enabled: boolean
    separator: string
    preserveNewlines: boolean
} {
    const m = globals.minify
    const format = globals.format
    // Default: xml strips newlines (tags are boundaries), json/other preserves them
    const defaultPreserveNewlines = format !== 'xml'

    if (m === false) return { enabled: false, separator: ' ', preserveNewlines: true }
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
    // Block path
    if ('blockResult' in input)
        // JSON block result serialization is not supported
        // so this has been simplified to simply minify the
        // message provided.
        //
        // Per https://code.claude.com/docs/en/hooks#common-input-fields;
        // > Exit 2 means a blocking error.
        // > Claude Code ignores stdout and any JSON in it.
        // > Instead, stderr text is fed back to Claude as an error message.
        return minify(input.blockResult.message)

    const {
        event,
        warnMessages,
        injectionResults,
        pluginContextResults = [],
        metaResult,
        langResult,
        testResult,
        globals,
    } = input

    // Collect all context strings
    const parts: string[] = [
        ...injectionResults,
        ...pluginContextResults,
        ...warnMessages,
        ...(metaResult ? [metaResult] : []),
        ...(langResult ? [langResult] : []),
        ...(testResult ? [testResult] : []),
    ].filter(s => s.length > 0)

    if (parts.length === 0) return ''

    let combined = parts.join('\n')

    // Apply content minification (condense whitespace for token efficiency)
    const { enabled, separator, preserveNewlines } = resolveMinify(globals)
    if (enabled) {
        combined = condense(combined, separator, preserveNewlines)
    }

    return minify(
        JSON.stringify({
            hookSpecificOutput: { hookEventName: event, additionalContext: combined },
        })
    )
}
