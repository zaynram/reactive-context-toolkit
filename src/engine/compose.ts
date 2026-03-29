import type { HookEvent, GlobalsConfig, MinifyConfig } from "#config/types"
import { minify, condense } from "#util/general"

export interface ComposeInput {
  event: HookEvent
  blockResult: { message: string } | null
  warnMessages: string[]
  injectionResults: string[]
  metaResult: string | null
  langResult: string | null
  testResult: string | null
  globals: Required<GlobalsConfig>
}

function resolveMinify(globals: Required<GlobalsConfig>): { enabled: boolean; separator: string } {
  const m = globals.minify
  if (m === false) return { enabled: false, separator: " " }
  if (m === true || m === undefined) return { enabled: true, separator: " " }
  return { enabled: m.enabled !== false, separator: m.separator ?? " " }
}

export function composeOutput(input: ComposeInput): string {
  const { event, blockResult, warnMessages, injectionResults, metaResult, langResult, testResult, globals } = input

  // Block path
  if (blockResult) {
    return minify(JSON.stringify({
      decision: "block",
      reason: blockResult.message,
      hookSpecificOutput: { hookEventName: event },
    }))
  }

  // Collect all context strings
  const parts: string[] = [
    ...injectionResults,
    ...warnMessages,
    ...(metaResult ? [metaResult] : []),
    ...(langResult ? [langResult] : []),
    ...(testResult ? [testResult] : []),
  ].filter(s => s.length > 0)

  if (parts.length === 0) return ""

  let combined = parts.join("\n")

  // Apply content minification (condense whitespace for token efficiency)
  const { enabled, separator } = resolveMinify(globals)
  if (enabled) {
    combined = condense(combined, separator)
  }

  return minify(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: combined,
    },
  }))
}
