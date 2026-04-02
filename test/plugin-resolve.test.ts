import { describe, expect, test } from 'bun:test'
import { resolvePlugin } from '#plugin/resolve'

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
