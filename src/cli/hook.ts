#!/usr/bin/env bun
import { buildFileRegistry } from '#config/files'
import { loadConfig } from '#config/loader'
import { validateConfig, desugarFileInjections, applyPlugins } from '#config/schema'
import type { HookEvent, TestConfig, LangTestConfig } from '#config/types'
import { CLAUDE_PROJECT_DIR } from '#constants'
import { composeOutput } from '#engine/compose'
import { evaluateInjections } from '#engine/injections'
import { generateMeta } from '#engine/meta'
import { evaluateRules } from '#engine/rules'
import { evaluateLang } from '#lang'
import type { PluginHookInput } from '#plugin/types'
import {
    resolveTestCommand,
    resolveLangTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
    TestCommandInfo,
} from '#test/runner'

const SYNC_EVENTS: HookEvent[] = ['SessionStart', 'Setup']
const TIMEOUT_MS = parseInt(process.env.RCT_PLUGIN_TIMEOUT_MS ?? '5000')

async function withTimeout<T>(
    fn: () => T | Promise<T>,
    ms: number,
    label: string
): Promise<T | undefined> {
    const TIMEOUT_SENTINEL = Symbol('timeout')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            Promise.resolve(fn()),
            new Promise<typeof TIMEOUT_SENTINEL>(resolve => {
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
            `[rct] Warning: ${label}: ${err instanceof Error ? err.message : String(err)}`
        )
        return undefined
    } finally {
        if (timer !== undefined) clearTimeout(timer)
    }
}

export { withTimeout }

export default async function hook(event: HookEvent) {
    const { config, extensions, registry, globals } = await loadConfig()
        .then(validateConfig)
        .then(applyPlugins)
        .then(({ config, ...rest }) => ({
            ...rest,
            config: desugarFileInjections(config),
        }))
        .then(({ config: { globals, files = [], ...config }, ...rest }) => ({
            ...rest,
            config,
            registry: buildFileRegistry(files),
            globals,
        }))

    const submitBlock = async (message: string): Promise<never> =>
        await Bun.stdout
            .write(
                composeOutput({
                    event,
                    globals,
                    blockResult: { message },
                    warnMessages: [],
                    injectionResults: [],
                    metaResult: null,
                    langResult: null,
                    testResult: null,
                })
            )
            .catch()
            .then(() => process.exit(2))

    const execute = async <T>(
        name: string,
        fn: (event: HookEvent, payload: PluginHookInput) => T
    ): Promise<Awaited<T | undefined>> =>
        await withTimeout(() => fn(event, stdin), TIMEOUT_MS, `plugin '${name}' context`)

    // Evaluate plugin triggers (before static rules — early exit on block)
    const stdin: PluginHookInput<typeof event, { tool_name?: string }> =
        SYNC_EVENTS.includes(event)
            ? { hook_event_name: event }
            : // Read stdin for async events
              await Bun.stdin
                  .json()
                  .catch(err =>
                      Bun.stderr
                          .write(`[rct] stdin parse error: ${String(err)}`)
                          .then(() => ({ hook_event_name: event }))
                  )

    const warnings = [] as string[]
    for (const { name, fn } of extensions.triggers) {
        const { action, message } = (await execute(name, fn)) ?? {}
        if (action === 'warn') warnings.push(message!)
        if (action === 'block') await submitBlock(message!)
    }

    // Evaluate static rules
    const ruleResult = evaluateRules(config.rules ?? [], event, stdin.tool_name, stdin)

    // If static rule blocks, output and exit
    if (ruleResult?.action === 'block') await submitBlock(ruleResult.messages.join('\n'))

    // Evaluate plugin contexts
    const context: string[] = []
    const sessionId = stdin.session_id
    for (const { name, fn, contextOn, contextFrequency } of extensions.contexts) {
        if (contextOn && [contextOn].flat().includes(event)) continue
        // Check frequency limit (persisted across hook invocations via temp file)
        if (contextFrequency && contextFrequency !== 'always') {
            const max = contextFrequency === 'once' ? 1 : contextFrequency
            const key = name.replace(/[^a-zA-Z0-9_-]/g, '_')
            const bunfile = Bun.file(`/tmp/rct-ctx-${sessionId}-${key}`)
            const count = await bunfile
                .text()
                .then(text => parseInt(text, 10))
                .catch(() => 0)
            if (count >= max) continue
            await bunfile
                .write(`${count + 1}`)
                .catch(err => Bun.stderr.write(String(err)))
        }
        await execute(name, fn).then(res => res !== undefined && context.push(res))
    }

    // Test — per-language with top-level inheritance
    const testResults: string[] = []
    const topLevelTest: TestConfig | undefined =
        config.test && typeof config.test === 'object'
            ? config.test
            : config.test
              ? { command: config.test as true | string }
              : undefined

    if ([topLevelTest?.injectOn ?? 'SessionStart'].flat().includes(event)) {
        const sessionId = stdin.session_id
        const cacheEnabled = topLevelTest?.cache === true
        const cacheTTL = topLevelTest?.cacheTTL ?? 300

        const processLangEntry = async (
            test: LangTestConfig,
            info: TestCommandInfo,
            lang?: string
        ) => {
            const data =
                (cacheEnabled &&
                    getCachedResult(sessionId, info.command, cacheTTL, lang)) ||
                runTest(info.command, CLAUDE_PROJECT_DIR)
            if (cacheEnabled) await setCachedResult(sessionId, info.command, data, lang)
            return formatTestResult({ ...data, lang, tool: info.tool }, test, globals)
        }

        Object.entries(config.lang ?? {}).forEach(async ([lang, entry]) => {
            if (!entry) return
            const test = entry.test ?? (topLevelTest && { command: true })
            if (!test) return
            const info = resolveLangTestCommand(test, entry)
            if (!info) return
            await processLangEntry(test, info, lang).then(testResults.push)
        })

        // Fallback: if no per-language tests ran but top-level exists, use v0.x behavior
        if (testResults.length === 0 && topLevelTest) {
            const info = resolveTestCommand(config)
            if (info) await processLangEntry(topLevelTest, info).then(testResults.push)
        }
    }

    await Bun.stdout
        .write(
            composeOutput({
                event,
                blockResult: null,
                pluginContextResults: context,
                warnMessages: [
                    ...(ruleResult?.action === 'warn' ? ruleResult.messages : []),
                    ...warnings,
                ],
                injectionResults: evaluateInjections(
                    config.injections ?? [],
                    event,
                    stdin.tool_name,
                    stdin,
                    registry,
                    globals
                ),
                metaResult:
                    config.meta &&
                    [config.meta.injectOn ?? 'SessionStart'].flat().includes(event)
                        ? generateMeta(config, registry, globals, config.meta)
                        : null,
                langResult: config.lang
                    ? evaluateLang(config.lang, event, CLAUDE_PROJECT_DIR).join('\n')
                    : null,
                testResult: testResults.length > 0 ? testResults.join('\n') : null,
                globals,
            })
        )
        .catch()
        .then(() => process.exit(0))
}
