import { describe, expect, test } from 'bun:test'
import { evaluateLang, extractTsconfigPaths } from '#lang/index'
import type { LangConfig } from '#config/types'
import path from 'path'

const fixtureDir = path.resolve(import.meta.dir, 'fixtures/project')

describe('evaluateLang', () => {
    test('returns bun scripts for configured bun tool', () => {
        const lang: LangConfig = {
            node: { tools: [{ name: 'bun', scripts: true }] },
        }
        const results = evaluateLang(lang, 'SessionStart', fixtureDir)
        expect(results.length).toBeGreaterThan(0)
        const joined = results.join('')
        expect(joined).toContain('test')
        expect(joined).toContain('bun test')
    })

    test('skips tools not matching event but still auto-discovers config', () => {
        const lang: LangConfig = {
            node: {
                tools: [{ name: 'bun', scripts: true, injectOn: 'PreToolUse' }],
            },
        }
        const results = evaluateLang(lang, 'SessionStart', fixtureDir)
        // Tools are skipped (injectOn: PreToolUse), but auto-discovered config still runs
        const joined = results.join('')
        expect(joined).not.toContain('bun test') // tool scripts not included
        expect(joined).toContain('path-alias') // auto-discovered tsconfig paths included
    })

    test('uses lang-level injectOn as default', () => {
        const lang: LangConfig = {
            node: {
                injectOn: 'PreToolUse',
                tools: [{ name: 'bun', scripts: true }],
            },
        }
        const results = evaluateLang(lang, 'PreToolUse', fixtureDir)
        expect(results.length).toBeGreaterThan(0)
    })

    test('returns cargo info for configured cargo tool', () => {
        const lang: LangConfig = { rust: { tools: [{ name: 'cargo' }] } }
        const results = evaluateLang(lang, 'SessionStart', fixtureDir)
        expect(results.length).toBeGreaterThan(0)
        expect(results.join('')).toContain('test-crate')
    })

    test('npm and pnpm tools produce same output shape as bun', () => {
        for (const name of ['npm', 'pnpm'] as const) {
            const lang: LangConfig = {
                node: { tools: [{ name, scripts: true }] },
            }
            const results = evaluateLang(lang, 'SessionStart', fixtureDir)
            expect(results.length).toBeGreaterThan(0)
            expect(results.join('')).toContain('test')
        }
    })

    test('uv, pip, pipx tools produce no output', () => {
        for (const name of ['uv', 'pip', 'pipx'] as const) {
            const lang: LangConfig = { python: { tools: [{ name }] } }
            const results = evaluateLang(lang, 'SessionStart', fixtureDir)
            expect(results).toHaveLength(0)
        }
    })

    test('cargo-binstall and rustup tools produce no output', () => {
        for (const name of ['cargo-binstall', 'rustup'] as const) {
            const lang: LangConfig = { rust: { tools: [{ name }] } }
            const results = evaluateLang(lang, 'SessionStart', '/nonexistent')
            expect(results).toHaveLength(0)
        }
    })
})

describe('auto-discovery', () => {
    test('auto-discovers tsconfig.json when entry.config is omitted', () => {
        const lang: LangConfig = {
            node: { tools: [{ name: 'bun', scripts: true }] },
        }
        const results = evaluateLang(lang, 'SessionStart', fixtureDir)
        const joined = results.join('')
        // Should auto-discover tsconfig.json and extract path aliases
        expect(joined).toContain('path-alias')
        expect(joined).toContain('#*')
    })

    test('does not mutate original entry object', () => {
        const entry = { tools: [{ name: 'bun' as const, scripts: true }] }
        const lang: LangConfig = { node: entry }
        evaluateLang(lang, 'SessionStart', fixtureDir)
        expect(entry).not.toHaveProperty('config')
    })

    test('does not auto-discover when entry.config is explicitly set', () => {
        const lang: LangConfig = {
            node: {
                tools: [{ name: 'bun', scripts: true }],
                config: [],
            },
        }
        const results = evaluateLang(lang, 'SessionStart', fixtureDir)
        const joined = results.join('')
        // Empty config array means no path extraction
        expect(joined).not.toContain('path-alias')
    })
})

describe('extractTsconfigPaths', () => {
    test('extracts paths from fixture tsconfig.json', () => {
        const tsconfigPath = path.join(fixtureDir, 'tsconfig.json')
        const result = extractTsconfigPaths(tsconfigPath)
        expect(result).not.toBeNull()
        expect(result).toContain('#*')
        expect(result).toContain('./src/*')
        expect(result).toContain('path-alias')
    })

    test('returns null when file does not exist', () => {
        const result = extractTsconfigPaths('/nonexistent/tsconfig.json')
        expect(result).toBeNull()
    })
})
