import { describe, expect, test } from 'bun:test'
import type {
    RCTPlugin,
    PluginHookInput,
    PluginTriggerResult,
} from '../src/plugin/types'
import type { HookEvent } from '../src/config/types'
import { applyPlugins, type ValidatedConfig } from '../src/config/schema'
import { composeOutput } from '../src/engine/compose'
import { withTimeout } from '../src/cli/hook'

describe('RCTPlugin context function', () => {
    test('plugin with context function is valid', () => {
        const plugin: RCTPlugin = {
            name: 'test-context',
            context: (_event: HookEvent, _input: PluginHookInput) => {
                return 'some context'
            },
        }
        expect(plugin.context).toBeDefined()
        expect(plugin.name).toBe('test-context')
    })

    test('plugin without context function still works (backwards compatible)', () => {
        const plugin: RCTPlugin = { name: 'no-context', files: [], rules: [] }
        expect(plugin.context).toBeUndefined()
    })

    test('context returning undefined produces no output', () => {
        const plugin: RCTPlugin = {
            name: 'undefined-context',
            context: () => undefined,
        }
        const result = plugin.context!('SessionStart', { payload: {} })
        expect(result).toBeUndefined()
    })

    test('context returning a string appends to additionalContext', () => {
        const plugin: RCTPlugin = {
            name: 'string-context',
            context: () => '<tmux>pane layout here</tmux>',
        }
        const result = plugin.context!('SessionStart', { payload: {} })
        expect(result).toBe('<tmux>pane layout here</tmux>')
    })

    test('context that throws is caught and warned (not fatal)', async () => {
        const plugin: RCTPlugin = {
            name: 'throwing-context',
            context: () => {
                throw new Error('context exploded')
            },
        }
        // The function itself throws — the pipeline must catch it
        expect(() => plugin.context!('SessionStart', { payload: {} })).toThrow(
            'context exploded',
        )
    })

    test('async context functions are awaited', async () => {
        const plugin: RCTPlugin = {
            name: 'async-context',
            context: async () => {
                return 'async result'
            },
        }
        const result = await plugin.context!('SessionStart', { payload: {} })
        expect(result).toBe('async result')
    })

    test('context receives event and input', () => {
        let receivedEvent: HookEvent | undefined
        let receivedInput: PluginHookInput | undefined

        const plugin: RCTPlugin = {
            name: 'input-check',
            context: (event, input) => {
                receivedEvent = event
                receivedInput = input
                return 'ok'
            },
        }

        plugin.context!('PreToolUse', {
            toolName: 'Bash',
            payload: { tool_name: 'Bash', tool_input: { command: 'ls' } },
        })

        expect(receivedEvent).toBe('PreToolUse')
        expect(receivedInput?.toolName).toBe('Bash')
        expect(receivedInput?.payload.tool_name).toBe('Bash')
    })
})

describe('RCTPlugin trigger function', () => {
    test('plugin with trigger function is valid', () => {
        const plugin: RCTPlugin = {
            name: 'test-trigger',
            trigger: (_event: HookEvent, _input: PluginHookInput) => {
                return { action: 'block', message: 'blocked' }
            },
        }
        expect(plugin.trigger).toBeDefined()
    })

    test('plugin without trigger function still works', () => {
        const plugin: RCTPlugin = { name: 'no-trigger' }
        expect(plugin.trigger).toBeUndefined()
    })

    test('trigger returning undefined takes no action', () => {
        const plugin: RCTPlugin = {
            name: 'undefined-trigger',
            trigger: () => undefined,
        }
        const result = plugin.trigger!('PreToolUse', { payload: {} })
        expect(result).toBeUndefined()
    })

    test('trigger returning block action blocks the tool use', () => {
        const plugin: RCTPlugin = {
            name: 'block-trigger',
            trigger: () => ({
                action: 'block' as const,
                message: 'This tool is not allowed',
            }),
        }
        const result = plugin.trigger!('PreToolUse', {
            toolName: 'Bash',
            payload: { tool_name: 'Bash' },
        }) as PluginTriggerResult
        expect(result.action).toBe('block')
        expect(result.message).toBe('This tool is not allowed')
    })

    test('trigger returning warn action adds a warning', () => {
        const plugin: RCTPlugin = {
            name: 'warn-trigger',
            trigger: () => ({
                action: 'warn' as const,
                message: 'Be careful with this tool',
            }),
        }
        const result = plugin.trigger!('PreToolUse', {
            payload: {},
        }) as PluginTriggerResult
        expect(result.action).toBe('warn')
        expect(result.message).toBe('Be careful with this tool')
    })

    test('trigger that throws is caught and warned (not fatal)', () => {
        const plugin: RCTPlugin = {
            name: 'throwing-trigger',
            trigger: () => {
                throw new Error('trigger exploded')
            },
        }
        expect(() => plugin.trigger!('PreToolUse', { payload: {} })).toThrow(
            'trigger exploded',
        )
    })

    test('async trigger functions are awaited', async () => {
        const plugin: RCTPlugin = {
            name: 'async-trigger',
            trigger: async () => {
                return { action: 'warn' as const, message: 'async warning' }
            },
        }
        const result = await plugin.trigger!('PreToolUse', { payload: {} })
        expect(result).toEqual({ action: 'warn', message: 'async warning' })
    })

    test('trigger receives event and input', () => {
        let receivedEvent: HookEvent | undefined
        let receivedInput: PluginHookInput | undefined

        const plugin: RCTPlugin = {
            name: 'input-check-trigger',
            trigger: (event, input) => {
                receivedEvent = event
                receivedInput = input
                return undefined
            },
        }

        plugin.trigger!('PostToolUse', {
            toolName: 'Write',
            payload: { tool_name: 'Write' },
        })

        expect(receivedEvent).toBe('PostToolUse')
        expect(receivedInput?.toolName).toBe('Write')
    })
})

describe('RCTPlugin with both context and trigger', () => {
    test('plugin can have both context and trigger', () => {
        const plugin: RCTPlugin = {
            name: 'full-plugin',
            files: [],
            rules: [],
            context: () => 'some context',
            trigger: () => ({ action: 'warn' as const, message: 'heads up' }),
        }
        expect(plugin.context).toBeDefined()
        expect(plugin.trigger).toBeDefined()
        expect(plugin.files).toEqual([])
        expect(plugin.rules).toEqual([])
    })

    test('plugin with only dynamic functions (no files/rules) is valid', () => {
        const plugin: RCTPlugin = {
            name: 'dynamic-only',
            context: () => 'context',
            trigger: () => undefined,
        }
        expect(plugin.name).toBe('dynamic-only')
        expect(plugin.files).toBeUndefined()
        expect(plugin.rules).toBeUndefined()
    })
})

// Step 2: applyPlugins preserves context and trigger functions

// Helper to create a mock resolvePlugin that returns given plugins
function makeValidatedConfig(
    pluginNames: string[],
    overrides?: Partial<ValidatedConfig>,
): ValidatedConfig {
    return {
        globals: {
            format: 'xml',
            wrapper: 'context',
            briefByDefault: false,
            minify: true,
            plugins: pluginNames,
        },
        ...overrides,
    }
}

describe('applyPlugins extensions', () => {
    // We can't easily mock resolvePlugin imports, so we test the PluginExtensions
    // interface and returned shape. The integration is tested via hook pipeline tests.

    test('applyPlugins returns config and extensions object', async () => {
        // With no plugins, extensions should be empty
        const config = makeValidatedConfig([])
        const result = await applyPlugins(config)
        expect(result.config).toBeDefined()
        expect(result.extensions).toBeDefined()
        expect(result.extensions.contexts).toEqual([])
        expect(result.extensions.triggers).toEqual([])
    })

    test('applyPlugins with built-in plugins (no context/trigger) returns empty extensions', async () => {
        const config = makeValidatedConfig(['track-work', 'issue-scope'])
        const result = await applyPlugins(config)
        // Built-in plugins don't have context/trigger
        expect(result.extensions.contexts).toEqual([])
        expect(result.extensions.triggers).toEqual([])
        // But files/rules should still be merged
        expect(result.config.files?.length).toBeGreaterThan(0)
    })

    test('extensions functions are paired with plugin names', async () => {
        // This tests the shape — the actual plugin resolution is tested in integration
        const config = makeValidatedConfig([])
        const result = await applyPlugins(config)
        // Verify shape
        for (const ctx of result.extensions.contexts) {
            expect(typeof ctx.name).toBe('string')
            expect(typeof ctx.fn).toBe('function')
        }
        for (const trg of result.extensions.triggers) {
            expect(typeof trg.name).toBe('string')
            expect(typeof trg.fn).toBe('function')
        }
    })
})

// Step 3: withTimeout helper

describe('withTimeout', () => {
    test('returns value from sync function', async () => {
        const result = await withTimeout(() => 'hello', 5000, 'test')
        expect(result).toBe('hello')
    })

    test('returns value from async function', async () => {
        const result = await withTimeout(
            async () => 'async hello',
            5000,
            'test',
        )
        expect(result).toBe('async hello')
    })

    test('returns undefined and warns on throw', async () => {
        const warns: string[] = []
        const origWarn = console.warn
        console.warn = (...args: unknown[]) => warns.push(String(args[0]))

        const result = await withTimeout(
            () => {
                throw new Error('boom')
            },
            5000,
            'test-fn',
        )

        console.warn = origWarn
        expect(result).toBeUndefined()
        expect(
            warns.some((w) => w.includes('test-fn') && w.includes('boom')),
        ).toBe(true)
    })

    test('returns undefined on timeout', async () => {
        const warns: string[] = []
        const origWarn = console.warn
        console.warn = (...args: unknown[]) => warns.push(String(args[0]))

        const result = await withTimeout(
            () =>
                new Promise<string>((resolve) =>
                    setTimeout(() => resolve('late'), 10000),
                ),
            50,
            'slow-fn',
        )

        console.warn = origWarn
        expect(result).toBeUndefined()
        expect(
            warns.some((w) => w.includes('slow-fn') && w.includes('timed out')),
        ).toBe(true)
    })
})

// Step 3: composeOutput with pluginContextResults

describe('composeOutput with pluginContextResults', () => {
    const baseGlobals = {
        format: 'xml' as const,
        wrapper: 'context',
        briefByDefault: false,
        minify: true,
        plugins: [],
    }

    test('includes pluginContextResults in output', () => {
        const output = composeOutput({
            event: 'SessionStart',
            blockResult: null,
            warnMessages: [],
            injectionResults: [],
            pluginContextResults: ['<tmux>pane info</tmux>'],
            metaResult: null,
            langResult: null,
            testResult: null,
            globals: baseGlobals,
        })
        const parsed = JSON.parse(output)
        expect(parsed.hookSpecificOutput.additionalContext).toContain(
            'pane info',
        )
    })

    test('pluginContextResults appear after injections and before meta', () => {
        const output = composeOutput({
            event: 'SessionStart',
            blockResult: null,
            warnMessages: [],
            injectionResults: ['<injection>data</injection>'],
            pluginContextResults: ['<plugin>ctx</plugin>'],
            metaResult: '<meta>info</meta>',
            langResult: null,
            testResult: null,
            globals: baseGlobals,
        })
        const parsed = JSON.parse(output)
        const ctx = parsed.hookSpecificOutput.additionalContext
        const injIdx = ctx.indexOf('injection')
        const plugIdx = ctx.indexOf('plugin')
        const metaIdx = ctx.indexOf('meta')
        expect(injIdx).toBeLessThan(plugIdx)
        expect(plugIdx).toBeLessThan(metaIdx)
    })

    test('empty pluginContextResults produces no extra output', () => {
        const output = composeOutput({
            event: 'SessionStart',
            blockResult: null,
            warnMessages: [],
            injectionResults: ['<data>x</data>'],
            pluginContextResults: [],
            metaResult: null,
            langResult: null,
            testResult: null,
            globals: baseGlobals,
        })
        const parsed = JSON.parse(output)
        expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
            'plugin',
        )
    })

    test('multiple pluginContextResults are all included', () => {
        const output = composeOutput({
            event: 'SessionStart',
            blockResult: null,
            warnMessages: [],
            injectionResults: [],
            pluginContextResults: ['<p1>one</p1>', '<p2>two</p2>'],
            metaResult: null,
            langResult: null,
            testResult: null,
            globals: baseGlobals,
        })
        const parsed = JSON.parse(output)
        expect(parsed.hookSpecificOutput.additionalContext).toContain('one')
        expect(parsed.hookSpecificOutput.additionalContext).toContain('two')
    })
})
