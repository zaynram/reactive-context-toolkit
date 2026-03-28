#!/usr/bin/env bun
import { loadConfig } from "./config/loader"
import { validateConfig, desugarFileInjections } from "./config/schema"
import { buildFileRegistry } from "./config/files"
import { evaluateRules } from "./engine/rules"
import { evaluateInjections } from "./engine/injections"
import { generateMeta } from "./engine/meta"
import { evaluateLang } from "./lang"
import { resolveTestCommand, runTest, formatTestResult } from "./test/runner"
import { composeOutput } from "./engine/compose"
import type { HookEvent } from "./config/types"

const SYNC_EVENTS: HookEvent[] = ["SessionStart", "Setup"]

async function main() {
  const event = process.argv[2] as HookEvent
  if (!event) { process.exit(1) }

  const config = await loadConfig()
  const validated = validateConfig(config)
  const desugared = desugarFileInjections(validated)
  const registry = buildFileRegistry(desugared.files ?? [], process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
  const globals = validated.globals ?? { format: "xml" as const, wrapper: "context" as const, briefByDefault: false }

  let payload: Record<string, unknown> = {}
  let toolName: string | undefined

  // Read stdin for async events
  if (!SYNC_EVENTS.includes(event)) {
    const stdin = await new Promise<string>((resolve) => {
      let data = ""
      process.stdin.on("data", (chunk: Buffer | string) => (data += chunk))
      process.stdin.on("end", () => resolve(data))
      process.stdin.on("error", () => resolve("{}"))
    })
    try {
      payload = JSON.parse(stdin) ?? {}
      toolName = (payload as any).tool_name
    } catch { payload = {} }
  }

  // Evaluate rules
  const ruleResult = evaluateRules(desugared.rules ?? [], event, toolName, payload)

  // If block, output and exit
  if (ruleResult?.action === "block") {
    const output = composeOutput({
      event, blockResult: { message: ruleResult.messages[0] },
      warnMessages: [], injectionResults: [],
      metaResult: null, langResult: null, testResult: null,
    })
    console.log(output)
    process.exit(2)
  }

  // Evaluate injections
  const injectionResults = evaluateInjections(
    desugared.injections ?? [], event, toolName, payload, registry, globals
  )

  // Warn messages
  const warnMessages = ruleResult?.action === "warn" ? ruleResult.messages : []

  // Meta
  let metaResult: string | null = null
  if (desugared.meta) {
    const metaEvents = Array.isArray(desugared.meta.injectOn) ? desugared.meta.injectOn : [desugared.meta.injectOn ?? "SessionStart"]
    if (metaEvents.includes(event)) {
      metaResult = generateMeta(desugared, registry, globals, desugared.meta)
    }
  }

  // Lang
  const langResults = desugared.lang ? evaluateLang(desugared.lang, event, process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), globals) : []
  const langResult = langResults.length > 0 ? langResults.join("\n") : null

  // Test
  let testResult: string | null = null
  if (desugared.test) {
    const testConfig = typeof desugared.test === "object" && typeof desugared.test !== "boolean" ? desugared.test : { command: desugared.test as true | string }
    const testEvents = Array.isArray((testConfig as any).injectOn) ? (testConfig as any).injectOn : [(testConfig as any).injectOn ?? "SessionStart"]
    if (testEvents.includes(event)) {
      const cmd = resolveTestCommand(desugared)
      if (cmd) {
        const result = runTest(cmd, process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
        testResult = formatTestResult(result, typeof testConfig === "object" ? (testConfig as any).brief : undefined)
      }
    }
  }

  const output = composeOutput({
    event, blockResult: null,
    warnMessages, injectionResults,
    metaResult, langResult, testResult,
  })

  if (output) console.log(output)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
