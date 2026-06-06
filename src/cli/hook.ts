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
import { withTimeout, parseInput } from '#lib/io'
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
import error from '#util/error'

const TIMEOUT_MS = parseInt(process.env.RCT_PLUGIN_TIMEOUT_MS ?? '5000')

export default async function runHook(event: HookEvent) {
    const {
        config: {
            globals,
            files = [],
            injections = [],
            lang = {},
            rules = [],
            ...config
        },
        extensions,
    } = await loadConfig()
        .then(validateConfig)
        .then(applyPlugins)
        .then(desugarFileInjections)

    const block = async (message: string): Promise<never> => {
        return await Bun.stderr
            .write(composeOutput({ blockResult: { message } }))
            .then(() => process.exit(2))
    }

    const execute = async <T>(
        name: string,
        fn: (event: HookEvent, payload: PluginHookInput) => T
    ): Promise<Awaited<T | void>> =>
        await withTimeout(() => fn(event, stdin), TIMEOUT_MS, `plugin::${name}::context`)

    // Evaluate plugin triggers (before static rules — early exit on block)
    const stdin: PluginHookInput<typeof event, { tool_name?: string }> =
        await parseInput(event)

    const warnings = [] as string[]
    for (const { name, fn } of extensions.triggers) {
        const { action, message } = (await execute(name, fn)) ?? {}
        if (action === 'warn') warnings.push(message!)
        if (action === 'block') await block(message!)
    }

    // Evaluate static rules
    const ruleResult = evaluateRules(rules ?? [], event, stdin.tool_name, stdin)
    // If static rule blocks, output and exit
    if (ruleResult?.action === 'block') await block(ruleResult.messages.join('\n'))

    // Evaluate plugin contexts
    const context: string[] = []
    const sessionId = stdin.session_id
    for (const { name, fn, contextOn, contextFrequency } of extensions.contexts) {
        if (contextOn && ![contextOn].flat().includes(event)) continue
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
                .catch(err =>
                    error.write(`error saving context count for session ${sessionId}`, {
                        level: 'debug',
                        inner: err,
                    })
                )
        }
        await execute(name, fn).then(res => typeof res === 'string' && context.push(res))
    }

    // Test — per-language with top-level inheritance
    const testCommand = resolveTestCommand(config)
    const testResults = [] as string[]
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

        const results = await Promise.allSettled(
            Object.entries(lang).map(async ([lang, entry]) => {
                const test = entry?.test ?? (topLevelTest && { command: true })
                if (!test) return Promise.reject()
                const info = resolveLangTestCommand(test, entry)
                if (!info) return Promise.reject()
                return await processLangEntry(test, info, lang)
            })
        ).then(set => set.filter(res => 'value' in res).map(res => res.value))

        if (results.length) testResults.push(...results)
        else if (topLevelTest && testCommand)
            // Fallback: if no per-language tests ran but top-level exists, use v0.x behavior
            await processLangEntry(topLevelTest, testCommand).then(testResults.push)
    }

    const registry = buildFileRegistry(files)
    const output = composeOutput({
        event,
        pluginContextResults: context,
        warnMessages: [
            ...(ruleResult?.action === 'warn' ? ruleResult.messages : []),
            ...warnings,
        ],
        injectionResults: evaluateInjections(
            injections,
            event,
            stdin.tool_name,
            stdin,
            registry,
            globals
        ),
        metaResult:
            config.meta && [config.meta.injectOn ?? 'SessionStart'].flat().includes(event)
                ? generateMeta(config, registry, globals, config.meta)
                : null,
        langResult: lang
            ? evaluateLang(lang, event, CLAUDE_PROJECT_DIR).join('\n')
            : null,
        testResult: testResults.length > 0 ? testResults.join('\n') : null,
        globals,
    })

    await Bun.stdout.write(output)
    process.exit(0)
}
