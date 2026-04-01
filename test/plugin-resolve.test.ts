import { describe, expect, test } from 'bun:test'
import { resolvePlugin } from '#plugin/resolve'

describe('resolvePlugin', () => {
    test('resolves built-in track-work', async () => {
        const result = await resolvePlugin('track-work')
        expect(result.source).toBe('builtin')
        expect(result.plugin.name).toBe('track-work')
        expect(result.ref).toBe('track-work')
    })

    test('resolves built-in issue-scope', async () => {
        const result = await resolvePlugin('issue-scope')
        expect(result.source).toBe('builtin')
        expect(result.plugin.name).toBe('issue-scope')
    })

    test('throws for unknown plugin name', async () => {
        await expect(resolvePlugin('nonexistent-plugin')).rejects.toThrow(
            /Failed to load plugin/i,
        )
    })

    test('throws for missing local file', async () => {
        await expect(
            resolvePlugin('./.claude/hooks/rct/nonexistent.ts'),
        ).rejects.toThrow(/Failed to load plugin/i)
    })
})
