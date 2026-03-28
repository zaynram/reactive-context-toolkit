import type { RuleEntry, HookEvent } from "#config/types"
import { evaluateMatch } from "./evaluate"

export interface RuleResult {
  action: "block" | "warn"
  messages: string[]
}

export function evaluateRules(
  rules: RuleEntry[],
  event: HookEvent,
  toolName: string | undefined,
  payload: Record<string, unknown>,
): RuleResult | null {
  const blockMessages: string[] = []
  const warnMessages: string[] = []

  for (const rule of rules) {
    // Skip disabled rules
    if (rule.enabled === false) continue

    // Filter by event
    if (rule.on !== event) continue

    // Filter by matcher (pipe-delimited tool names)
    if (rule.matcher && toolName) {
      const matchers = rule.matcher.split("|")
      if (!matchers.includes(toolName)) continue
    } else if (rule.matcher && !toolName) {
      continue
    }

    // Evaluate match conditions against payload
    if (!evaluateMatch(rule.match, payload)) continue

    // Collect results
    if (rule.action === "block") {
      blockMessages.push(rule.message)
    } else {
      warnMessages.push(rule.message)
    }
  }

  // Block takes priority over warn
  if (blockMessages.length > 0) {
    return { action: "block", messages: [blockMessages[0]] }
  }

  if (warnMessages.length > 0) {
    return { action: "warn", messages: warnMessages }
  }

  return null
}
