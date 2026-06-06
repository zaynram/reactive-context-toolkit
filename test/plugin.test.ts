import getBuiltins from '#plugin/index'
import type { BuiltinPlugins } from '#plugin/types'
import { beforeAll, describe, expect, test } from 'bun:test'

let registry: BuiltinPlugins

beforeAll(async () => {
    registry = await getBuiltins()
})

describe('plugin registry', () => {
    test('contains all builtin plugins', () => {
        expect('rct-plugin-track-work' in registry).toBe(true)
        expect('rct-plugin-tasktools' in registry).toBe(true)
        expect('rct-plugin-read-guard' in registry).toBe(true)
    })

    test('each plugin has a name matching its registry key', () => {
        for (const [key, plugin] of Object.entries(registry))
            expect(plugin.ref as string).toBe(key)
    })
})

describe('rct-plugin-track-work', () => {
    test("has name 'rct-plugin-track-work'", () => {
        const { plugin } = registry['rct-plugin-track-work']!
        expect(plugin.name).toBe('rct-plugin-track-work')
    })

    test('contributes chores and plans files', () => {
        const { plugin } = registry['rct-plugin-track-work']!
        const aliases = (plugin.files ?? []).map(f => f.alias)
        expect(aliases).toContain('chores')
        expect(aliases).toContain('plans')
    })

    test('chores file has injectOn: SessionStart', () => {
        const { plugin } = registry['rct-plugin-track-work']!
        const chores = (plugin.files ?? []).find(f => f.alias === 'chores')
        expect(chores?.injectOn).toBe('SessionStart')
    })

    test('chores and plans have entry-schema metaFile', () => {
        const { plugin } = registry['rct-plugin-track-work']!
        for (const file of plugin.files ?? []) {
            expect(file.metaFiles?.some(m => m.alias === 'entry-schema')).toBe(true)
        }
    })
})
