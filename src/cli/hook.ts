#!/usr/bin/env bun
import { loadConfig } from '#config/loader'
import { CLAUDE_PROJECT_DIR } from '#constants'
import {
    validateConfig,
    desugarFileInjections,
    applyPlugins,
} from '#config/schema'
import { buildFileRegistry } from '#config/files'
import { evaluateRules } from '#engine/rules'
import { evaluateInjections } from '#engine/injections'
import { generateMeta } from '#engine/meta'
import { evaluateLang } from '#lang'
import {
    resolveTestCommand,
    resolveLangTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
} from '#test/runner'
import { composeOutput } from '#engine/compose'
import type { HookEvent, TestConfig, LangTestConfig } from '#config/types'
import type { PluginHookInput } from '#plugin/types'

const SYNC_EVENTS: HookEvent[] = ['SessionStart', 'Setup']
const PLUGIN_TIMEOUT_MS = 5000

async function withTimeout<T>(
    fn: () => T | Promise<T>,
    ms: number,
    label: string,
): Promise<T | undefined> {
    const TIMEOUT_SENTINEL = Symbol('timeout')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            Promise.resolve(fn()),
            new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
                timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), ms)
            }),
        ])
        if (result === TIMEOUT_SENTINEL) {
            console.warn(`[rct] Warning: ${label} timed out after ${ms}ms`)
            return undefined
        }
        return result as T
    } catch (err) {
        console.warn(
            `[rct] Warning: ${label}: ${err instanceof Error ? err.message : String(err)}`,
        )
        return undefined
    } finally {
        if (timer !== undefined) clearTimeout(timer)
    }
}

export { withTimeout }

async function main(eventArg?: string) {
    const event = (eventArg ?? process.argv[2]) as HookEvent
    if (!event) {
        console.error(
            '[rct] Error: No hook event specified. Usage: rct hook <HookEvent>',
        )
        process.exit(1)
    }

    const config = await loadConfig()
    const validated = validateConfig(config)
    const { config: withPlugins, extensions } = await applyPlugins(validated)
    const desugared = desugarFileInjections(withPlugins)
    const registry = buildFileRegistry(desugared.files ?? [])
    const globals = desugared.globals

    let payload: Record<string, unknown> = {}
    let toolName: string | undefined

    // Read stdin for async events
    if (!SYNC_EVENTS.includes(event)) {
        const stdin = await new Promise<string>((resolve) => {
            let data = ''
            process.stdin.on(
                'data',
                (chunk: Buffer | string) => (data += chunk),
            )
            process.stdin.on('end', () => resolve(data))
            process.stdin.on('error', (err) => {
                console.error(`[rct] stdin error: ${err.message}`)
                resolve('{}')
            })
        })
        try {
            payload = JSON.parse(stdin) ?? {}
            toolName = (payload as any).tool_name
        } catch (err) {
            console.error(
                `[rct] Failed to parse stdin JSON: ${err instanceof Error ? err.message : String(err)}`,
            )
            payload = {}
        }
    }

    // Evaluate plugin triggers (before static rules — early exit on block)
    const pluginInput: PluginHookInput = { toolName, payload }
    const pluginWarnMessages: string[] = []

    for (const { name, fn } of extensions.triggers) {
        const result = await withTimeout(
            () => fn(event, pluginInput),
            PLUGIN_TIMEOUT_MS,
            `plugin '${name}' trigger`,
        )
        if (result?.action === 'block') {
            const output = composeOutput({
                event,
                blockResult: { message: result.message },
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
        if (result?.action === 'warn') {
            pluginWarnMessages.push(result.message)
        }
    }

    // Evaluate static rules
    const ruleResult = evaluateRules(
        desugared.rules ?? [],
        event,
        toolName,
        payload,
    )

    // If static rule blocks, output and exit
    if (ruleResult?.action === 'block') {
        const output = composeOutput({
            event,
            blockResult: { message: ruleResult.messages.join('\n') },
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

    // Evaluate plugin contexts
    const pluginContextResults: string[] = []
    for (const { name, fn, contextOn } of extensions.contexts) {
        if (contextOn) {
            const events = Array.isArray(contextOn) ? contextOn : [contextOn]
            if (!events.includes(event)) continue
        }
        const result = await withTimeout(
            () => fn(event, pluginInput),
            PLUGIN_TIMEOUT_MS,
            `plugin '${name}' context`,
        )
        if (result !== undefined) {
            pluginContextResults.push(result)
        }
    }

    // Warn messages (static rules + plugin triggers)
    const warnMessages = [
        ...(ruleResult?.action === 'warn' ? ruleResult.messages : []),
        ...pluginWarnMessages,
    ]

    // Meta
    let metaResult: string | null = null
    if (desugared.meta) {
        const metaEvents =
            Array.isArray(desugared.meta.injectOn) ?
                desugared.meta.injectOn
            :   [desugared.meta.injectOn ?? 'SessionStart']
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
    const langResults =
        desugared.lang ?
            evaluateLang(desugared.lang, event, CLAUDE_PROJECT_DIR)
        :   []
    const langResult = langResults.length > 0 ? langResults.join('\n') : null

    // Test — per-language with top-level inheritance
    const testResults: string[] = []
    const topLevelTest: TestConfig | null =
        desugared.test && typeof desugared.test === 'object' ?
            (desugared.test as TestConfig)
        : desugared.test ? { command: desugared.test as true | string }
        : null

    const topInjectOn = topLevelTest?.injectOn
    const testEvents: HookEvent[] =
        Array.isArray(topInjectOn) ? topInjectOn : (
            [topInjectOn ?? 'SessionStart']
        )

    if (testEvents.includes(event)) {
        const sessionId =
            (payload as Record<string, string>).session_id ?? 'unknown'
        const cacheEnabled = topLevelTest?.cache === true
        const cacheTTL = topLevelTest?.cacheTTL ?? 300

        // Per-language test execution
        for (const [langName, entry] of Object.entries(desugared.lang ?? {})) {
            if (!entry) continue
            const langTest: LangTestConfig | undefined =
                entry.test ?? (topLevelTest ? { command: true } : undefined)
            if (!langTest) continue

            const cmdInfo = resolveLangTestCommand(langTest, entry)
            if (!cmdInfo) continue

            let rawResult =
                cacheEnabled ?
                    getCachedResult(
                        sessionId,
                        cmdInfo.command,
                        cacheTTL,
                        langName,
                    )
                :   null
            if (!rawResult) {
                rawResult = runTest(cmdInfo.command, CLAUDE_PROJECT_DIR)
                if (cacheEnabled)
                    await setCachedResult(
                        sessionId,
                        cmdInfo.command,
                        rawResult,
                        langName,
                    )
            }

            const result = { ...rawResult, tool: cmdInfo.tool, lang: langName }
            testResults.push(formatTestResult(result, langTest, globals))
        }

        // Fallback: if no per-language tests ran but top-level exists, use v0.x behavior
        if (testResults.length === 0 && topLevelTest) {
            const cmdInfo = resolveTestCommand(desugared)
            if (cmdInfo) {
                let rawResult =
                    cacheEnabled ?
                        getCachedResult(sessionId, cmdInfo.command, cacheTTL)
                    :   null
                if (!rawResult) {
                    rawResult = runTest(cmdInfo.command, CLAUDE_PROJECT_DIR)
                    if (cacheEnabled)
                        await setCachedResult(
                            sessionId,
                            cmdInfo.command,
                            rawResult,
                        )
                }
                const result = { ...rawResult, tool: cmdInfo.tool }
                testResults.push(
                    formatTestResult(result, topLevelTest, globals),
                )
            }
        }
    }
    const testResult = testResults.length > 0 ? testResults.join('\n') : null

    const output = composeOutput({
        event,
        blockResult: null,
        warnMessages,
        injectionResults,
        pluginContextResults,
        metaResult,
        langResult,
        testResult,
        globals,
    })

    if (output) console.log(output)
}

export default main
