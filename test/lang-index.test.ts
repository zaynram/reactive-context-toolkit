import { describe, expect, test } from 'bun:test'
import { evaluateLang, extractTsconfigPaths } from '#lang/index'
import type { LangConfig, GlobalsConfig } from '#config/types'
import path from 'path'

const fixtureDir = path.resolve(import.meta.dir, 'fixtures/project')
const defaultGlobals: GlobalsConfig = { format: 'xml' }

describe('evaluateLang', () => {
    test('returns bun scripts for configured bun tool', () => {
        const lang: LangConfig = {
            typescript: { tools: [{ name: 'bun', scripts: true }] },
        }
        const results = evaluateLang(
            lang,
            'SessionStart',
            fixtureDir,
            defaultGlobals,
        )
        expect(results.length).toBeGreaterThan(0)
        const joined = results.join('')
        expect(joined).toContain('test')
        expect(joined).toContain('bun test')
    })

    test('skips tools not matching event', () => {
        const lang: LangConfig = {
            typescript: {
                tools: [{ name: 'bun', scripts: true, injectOn: 'PreToolUse' }],
            },
        }
        const results = evaluateLang(
            lang,
            'SessionStart',
            fixtureDir,
            defaultGlobals,
        )
        expect(results.length).toBe(0)
    })

    test('uses lang-level injectOn as default', () => {
        const lang: LangConfig = {
            typescript: {
                injectOn: 'PreToolUse',
                tools: [{ name: 'bun', scripts: true }],
            },
        }
        const results = evaluateLang(
            lang,
            'PreToolUse',
            fixtureDir,
            defaultGlobals,
        )
        expect(results.length).toBeGreaterThan(0)
    })

    test('returns cargo info for configured cargo tool', () => {
        const lang: LangConfig = { rust: { tools: [{ name: 'cargo' }] } }
        const results = evaluateLang(
            lang,
            'SessionStart',
            fixtureDir,
            defaultGlobals,
        )
        expect(results.length).toBeGreaterThan(0)
        expect(results.join('')).toContain('test-crate')
    })

    test('npm and pnpm tools produce same output shape as bun', () => {
        for (const name of ['npm', 'pnpm'] as const) {
            const lang: LangConfig = {
                javascript: { tools: [{ name, scripts: true }] },
            }
            const results = evaluateLang(
                lang,
                'SessionStart',
                fixtureDir,
                defaultGlobals,
            )
            expect(results.length).toBeGreaterThan(0)
            expect(results.join('')).toContain('test')
        }
    })

    test('uv, pip, pipx tools produce no output', () => {
        for (const name of ['uv', 'pip', 'pipx'] as const) {
            const lang: LangConfig = { python: { tools: [{ name }] } }
            const results = evaluateLang(
                lang,
                'SessionStart',
                fixtureDir,
                defaultGlobals,
            )
            expect(results).toHaveLength(0)
        }
    })

    test('cargo-binstall and rustup tools produce no output', () => {
        for (const name of ['cargo-binstall', 'rustup'] as const) {
            const lang: LangConfig = { rust: { tools: [{ name }] } }
            const results = evaluateLang(
                lang,
                'SessionStart',
                '/nonexistent',
                defaultGlobals,
            )
            expect(results).toHaveLength(0)
        }
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
