import { describe, expect, test } from 'bun:test'
import { resolvePlugin } from '#plugin/resolve'
import { displayName } from '#plugin/types'
import { validatePlugin } from '#plugin/validate'

describe('resolvePlugin', () => {
    test('resolves built-in track-work', async () => {
        const result = await resolvePlugin('rct-plugin-track-work')
        expect(result.source).toBe('builtin')
        expect(result.plugin.name).toBe('rct-plugin-track-work')
        expect(result.ref).toBe('rct-plugin-track-work')
    })

    test('resolves built-in issue-scope', async () => {
        const result = await resolvePlugin('rct-plugin-issue-scope')
        expect(result.source).toBe('builtin')
        expect(result.plugin.name).toBe('rct-plugin-issue-scope')
    })

    test('throws for unknown plugin name', async () => {
        const promise = resolvePlugin('nonexistent-plugin')
        expect(promise).rejects.toThrow(/Failed to load plugin/i)
    })

    test('throws for missing local file', async () => {
        const promise = resolvePlugin('./.claude/hooks/rct/nonexistent.ts')
        expect(promise).rejects.toThrow(/Failed to load plugin/i)
    })
})

describe('displayName', () => {
    test('strips rct-plugin- prefix', () => {
        expect(displayName({ name: 'rct-plugin-tmux' }, 'rct-plugin-tmux')).toBe('tmux')
    })

    test('uses plugin.name when present', () => {
        expect(displayName({ name: 'custom-name' }, 'rct-plugin-foo')).toBe('custom-name')
    })

    test('falls back to ref when name absent', () => {
        expect(displayName({}, 'rct-plugin-bar')).toBe('bar')
    })

    test('preserves names without rct-plugin- prefix', () => {
        expect(displayName({ name: 'my-plugin' }, 'my-plugin')).toBe('my-plugin')
    })
})

describe('validatePlugin', () => {
    test('accepts plugin with no properties', () => {
        expect(() => validatePlugin({}, 'test-ref')).not.toThrow()
    })

    test('rejects non-object', () => {
        expect(() => validatePlugin(null, 'test')).toThrow(/must export an object/)
        expect(() => validatePlugin('string', 'test')).toThrow(/must export an object/)
    })

    test('rejects invalid property types', () => {
        expect(() => validatePlugin({ name: 123 }, 'test')).toThrow(/must be string/)
        expect(() => validatePlugin({ context: 'not-fn' }, 'test')).toThrow(/must be function/)
        expect(() => validatePlugin({ trigger: 42 }, 'test')).toThrow(/must be function/)
        expect(() => validatePlugin({ setup: true }, 'test')).toThrow(/must be function/)
        expect(() => validatePlugin({ files: 'not-array' }, 'test')).toThrow(/must be an array/)
        expect(() => validatePlugin({ rules: {} }, 'test')).toThrow(/must be an array/)
    })
})
