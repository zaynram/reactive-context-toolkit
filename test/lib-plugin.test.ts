import { describe, it, expect } from 'bun:test'
import { definePlugin } from '#lib/plugin'
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
                    on: 'PreToolUse',
                    match: [{ target: 'tool_name', pattern: 'Write' }],
                    action: 'warn',
                    message: 'Be careful',
                },
            ],
        })
        expect(plugin.name).toBe('rules-only')
        expect(plugin.files).toBeUndefined()
    })

    it('accepts single argument (no setup parameter)', () => {
        expect(definePlugin.length).toBe(1)
    })

    it('resolves metaFile paths to absolute', () => {
        const plugin = definePlugin({
            name: 'meta-path-plugin',
            files: [
                {
                    alias: 'scope',
                    path: '.claude/context/scope.xml',
                    metaFiles: [{ alias: 'schema', path: 'schemas/scope.xml' }],
                },
            ],
        })
        const mf = plugin.files![0].metaFiles![0]
        expect(path.isAbsolute(mf.path)).toBe(true)
        expect(mf.path).toContain('schemas')
    })

    it('preserves absolute metaFile paths', () => {
        const absPath = path.resolve('/tmp/schema.xml')
        const plugin = definePlugin({
            files: [
                {
                    alias: 'scope',
                    path: '.claude/scope.xml',
                    metaFiles: [{ alias: 'schema', path: absPath }],
                },
            ],
        })
        expect(plugin.files![0].metaFiles![0].path).toBe(absPath)
    })

    it('handles plugins with no name', () => {
        const plugin = definePlugin({ files: [] })
        expect(plugin.name).toBeUndefined()
    })

    it('does not mutate the original files array', () => {
        const originalFiles = [
            { alias: 'test', path: 'relative/path.xml' },
        ]
        const originalPath = originalFiles[0].path
        definePlugin({ files: originalFiles })
        // Original array should be unchanged
        expect(originalFiles[0].path).toBe(originalPath)
    })

    it('returns a new object (no mutation)', () => {
        const input = {
            name: 'test',
            files: [{ alias: 'a', path: 'a.xml' }],
        }
        const result = definePlugin(input)
        expect(result).not.toBe(input) // different object
        expect(result.files).not.toBe(input.files) // different array
    })
})
