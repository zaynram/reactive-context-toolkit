#!/usr/bin/env bun
import { loadConfig, CLAUDE_PROJECT_DIR } from "#config/loader"
import { validateConfig, desugarFileInjections, applyPlugins } from "#config/schema"
import { buildFileRegistry } from "#config/files"
import { evaluateRules } from "#engine/rules"
import { evaluateInjections } from "#engine/injections"
import { generateMeta } from "#engine/meta"
import { evaluateLang } from "#lang"
import {
    resolveTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
} from "#test/runner"
import { composeOutput } from "#engine/compose"
import type { HookEvent, TestConfig } from "#config/types"

const SYNC_EVENTS: HookEvent[] = ["SessionStart", "Setup"]

async function main(eventArg?: string) {
    const event = (eventArg ?? process.argv[2]) as HookEvent
    if (!event) {
        process.exit(1)
    }

    const config = await loadConfig()
    const validated = validateConfig(config)
    const withPlugins = applyPlugins(validated)
    const desugared = desugarFileInjections(withPlugins)
    const registry = buildFileRegistry(desugared.files ?? [])
    const globals = desugared.globals

    let payload: Record<string, unknown> = {}
    let toolName: string | undefined

    // Read stdin for async events
    if (!SYNC_EVENTS.includes(event)) {
        const stdin = await new Promise<string>(resolve => {
            let data = ""
            process.stdin.on(
                "data",
                (chunk: Buffer | string) => (data += chunk),
            )
            process.stdin.on("end", () => resolve(data))
            process.stdin.on("error", () => resolve("{}"))
        })
        try {
            payload = JSON.parse(stdin) ?? {}
            toolName = (payload as any).tool_name
        } catch {
            payload = {}
        }
    }

    // Evaluate rules
    const ruleResult = evaluateRules(
        desugared.rules ?? [],
        event,
        toolName,
        payload,
    )

    // If block, output and exit
    if (ruleResult?.action === "block") {
        const output = composeOutput({
            event,
            blockResult: { message: ruleResult.messages.join("\n") },
            warnMessages: [],
            injectionResults: [],
            metaResult: null,
            langResult: null,
            testResult: null,
            globals,
        })
        console.log(output)
        process.exit(2)
    }

    // Evaluate injections
    const injectionResults = evaluateInjections(
        desugared.injections ?? [],
        event,
        toolName,
        payload,
        registry,
        globals,
    )

    // Warn messages
    const warnMessages =
        ruleResult?.action === "warn" ? ruleResult.messages : []

    // Meta
    let metaResult: string | null = null
    if (desugared.meta) {
        const metaEvents = Array.isArray(desugared.meta.injectOn)
            ? desugared.meta.injectOn
            : [desugared.meta.injectOn ?? "SessionStart"]
        if (metaEvents.includes(event)) {
            metaResult = generateMeta(
                desugared,
                registry,
                globals,
                desugared.meta,
            )
        }
    }

    // Lang
    const langResults = desugared.lang
        ? evaluateLang(desugared.lang, event, CLAUDE_PROJECT_DIR, globals)
        : []
    const langResult = langResults.length > 0 ? langResults.join("\n") : null

    // Test
    let testResult: string | null = null
    if (desugared.test) {
        const testConfig: TestConfig =
            desugared.test !== true && typeof desugared.test === "object"
                ? (desugared.test as TestConfig)
                : { command: desugared.test as true | string }
        const rawInjectOn = testConfig.injectOn
        const testEvents: HookEvent[] = Array.isArray(rawInjectOn)
            ? rawInjectOn
            : [rawInjectOn ?? "SessionStart"]
        if (testEvents.includes(event)) {
            const cmd = resolveTestCommand(desugared)
            if (cmd) {
                const sessionId =
                    (payload as Record<string, string>).session_id ?? "unknown"
                const cacheEnabled = testConfig.cache === true
                const cacheTTL = testConfig.cacheTTL ?? 300

                let result = cacheEnabled
                    ? getCachedResult(sessionId, cmd, cacheTTL)
                    : null
                if (!result) {
                    result = runTest(cmd, CLAUDE_PROJECT_DIR)
                    if (cacheEnabled) setCachedResult(sessionId, cmd, result)
                }
                testResult = formatTestResult(result, testConfig.brief)
            }
        }
    }

    const output = composeOutput({
        event,
        blockResult: null,
        warnMessages,
        injectionResults,
        metaResult,
        langResult,
        testResult,
        globals,
    })

    if (output) console.log(output)
}

export default main
