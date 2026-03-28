import type { HookEvent } from "#config/types"
import { minify } from "#util/general"

export interface ComposeInput {
  event: HookEvent
  blockResult: { message: string } | null
  warnMessages: string[]
  injectionResults: string[]
  metaResult: string | null
  langResult: string | null
  testResult: string | null
}

export function composeOutput(input: ComposeInput): string {
  const { event, blockResult, warnMessages, injectionResults, metaResult, langResult, testResult } = input

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
    ...warnMessages,
    ...injectionResults,
    ...(metaResult ? [metaResult] : []),
    ...(langResult ? [langResult] : []),
    ...(testResult ? [testResult] : []),
  ].filter(s => s.length > 0)

  if (parts.length === 0) return ""

  const combined = parts.join("\n")

  return minify(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: combined,
    },
  }))
}
