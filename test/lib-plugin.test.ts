import { describe, it, expect } from 'bun:test'
import { definePlugin } from '../src/lib/plugin'
import path from 'path'

describe('definePlugin()', () => {
    it('returns a valid plugin object', () => {
        const plugin = definePlugin({
            name: 'test-plugin',
            files: [],
            rules: [],
        })
        expect(plugin.name).toBe('test-plugin')
        expect(plugin.files).toEqual([])
        expect(plugin.rules).toEqual([])
    })

    it('resolves relative file paths to absolute', () => {
        const plugin = definePlugin({
            name: 'rel-path-plugin',
            files: [{ alias: 'readme', path: 'docs/README.md' }],
        })
        const resolved = plugin.files![0].path
        expect(path.isAbsolute(resolved)).toBe(true)
        expect(resolved).toContain('docs')
    })

    it('preserves absolute file paths', () => {
        const absPath = path.resolve('/tmp/absolute/file.xml')
        const plugin = definePlugin({
            name: 'abs-path-plugin',
            files: [{ alias: 'config', path: absPath }],
        })
        expect(plugin.files![0].path).toBe(absPath)
    })

    it('handles plugins without files', () => {
        const plugin = definePlugin({
            name: 'rules-only',
            rules: [
                {
                    on: ['PreToolUse'],
                    match: [{ target: 'tool_name', pattern: 'Write' }],
                    action: 'warn',
                    message: 'Be careful',
                },
            ],
        })
        expect(plugin.name).toBe('rules-only')
        expect(plugin.files).toBeUndefined()
    })
})
