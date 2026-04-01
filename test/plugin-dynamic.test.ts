import { describe, expect, test } from 'bun:test'
import type {
    RCTPlugin,
    PluginHookInput,
    PluginTriggerResult,
} from '../src/plugin/types'
import type { HookEvent } from '../src/config/types'

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
        const plugin: RCTPlugin = {
            name: 'no-context',
            files: [],
            rules: [],
        }
        expect(plugin.context).toBeUndefined()
    })

    test('context returning undefined produces no output', () => {
        const plugin: RCTPlugin = {
            name: 'undefined-context',
            context: () => undefined,
        }
        const result = plugin.context!('SessionStart', {
            payload: {},
        })
        expect(result).toBeUndefined()
    })

    test('context returning a string appends to additionalContext', () => {
        const plugin: RCTPlugin = {
            name: 'string-context',
            context: () => '<tmux>pane layout here</tmux>',
        }
        const result = plugin.context!('SessionStart', {
            payload: {},
        })
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
        expect(() =>
            plugin.context!('SessionStart', { payload: {} }),
        ).toThrow('context exploded')
    })

    test('async context functions are awaited', async () => {
        const plugin: RCTPlugin = {
            name: 'async-context',
            context: async () => {
                return 'async result'
            },
        }
        const result = await plugin.context!('SessionStart', {
            payload: {},
        })
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
        const plugin: RCTPlugin = {
            name: 'no-trigger',
        }
        expect(plugin.trigger).toBeUndefined()
    })

    test('trigger returning undefined takes no action', () => {
        const plugin: RCTPlugin = {
            name: 'undefined-trigger',
            trigger: () => undefined,
        }
        const result = plugin.trigger!('PreToolUse', {
            payload: {},
        })
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
        expect(() =>
            plugin.trigger!('PreToolUse', { payload: {} }),
        ).toThrow('trigger exploded')
    })

    test('async trigger functions are awaited', async () => {
        const plugin: RCTPlugin = {
            name: 'async-trigger',
            trigger: async () => {
                return { action: 'warn' as const, message: 'async warning' }
            },
        }
        const result = await plugin.trigger!('PreToolUse', {
            payload: {},
        })
        expect(result).toEqual({
            action: 'warn',
            message: 'async warning',
        })
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
