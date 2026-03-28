import type {
  RCTConfig,
  GlobalsConfig,
  MatchCondition,
  Match,
  HookEvent,
  InjectionEntry,
} from "./types"

export type ValidatedConfig = { globals: Required<GlobalsConfig> } & RCTConfig

const DEFAULT_GLOBALS: Required<GlobalsConfig> = {
  format: "xml",
  wrapper: "context",
  briefByDefault: false,
}

function validateRegex(pattern: string, context: string): void {
  try {
    new RegExp(pattern)
  } catch {
    throw new Error(`Invalid regex pattern in ${context}: ${pattern}`)
  }
}

function validateMatchCondition(condition: MatchCondition, context: string): void {
  const operator = condition.operator ?? "regex"
  if (operator === "regex" && typeof condition.pattern === "string") {
    validateRegex(condition.pattern, context)
  }
  if (operator === "regex" && Array.isArray(condition.pattern)) {
    for (const p of condition.pattern) {
      if (typeof p === "string") {
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

export function validateConfig(config: RCTConfig): ValidatedConfig {
  // Validate rules
  if (config.rules) {
    for (const rule of config.rules) {
      validateMatch(rule.match, `rule "${rule.description ?? rule.message}"`)
    }
  }

  // Validate injections
  if (config.injections) {
    for (const injection of config.injections) {
      validateMatch(injection.match, `injection "${injection.description ?? "unnamed"}"`)
    }
  }

  // Populate defaults
  const globals: Required<GlobalsConfig> = {
    ...DEFAULT_GLOBALS,
    ...config.globals,
  }

  return { ...config, globals }
}

export function desugarFileInjections(config: ValidatedConfig): ValidatedConfig {
  const files = config.files ?? []
  const existingInjections = [...(config.injections ?? [])]
  const newInjections: InjectionEntry[] = []

  for (const file of files) {
    if (!file.injectOn) continue
    const alias = file.alias ?? file.path
    const events: HookEvent[] = Array.isArray(file.injectOn)
      ? file.injectOn
      : [file.injectOn]

    for (const event of events) {
      // Check if explicit injection already exists for this alias+event
      const alreadyExists = existingInjections.some(
        (inj) => inj.on === event && inj.inject.includes(alias),
      )
      if (!alreadyExists) {
        newInjections.push({
          on: event,
          inject: [alias],
        })
      }
    }
  }

  return {
    ...config,
    injections: [...existingInjections, ...newInjections],
  }
}
