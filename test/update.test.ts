import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import path from 'path'

const TMP_DIR = path.resolve(__dirname, '../.tmp-update-test')

function setup(files: Record<string, string>) {
    mkdirSync(TMP_DIR, { recursive: true })
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(TMP_DIR, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, content)
    }
}

function cleanup() {
    if (existsSync(TMP_DIR)) {
        rmSync(TMP_DIR, { recursive: true, force: true })
    }
}

function readJSON(filePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/**
 * Runs the updateRCT function against TMP_DIR by dynamically importing
 * the module with CLAUDE_PROJECT_DIR set to TMP_DIR.
 */
async function runUpdate() {
    const original = process.env.CLAUDE_PROJECT_DIR
    process.env.CLAUDE_PROJECT_DIR = TMP_DIR
    try {
        // Fresh import each time to pick up env change
        const mod = await import('../src/cli/update')
        await mod.default()
    } finally {
        if (original !== undefined) {
            process.env.CLAUDE_PROJECT_DIR = original
        } else {
            delete process.env.CLAUDE_PROJECT_DIR
        }
    }
}

describe('rct update', () => {
    beforeEach(cleanup)
    afterEach(cleanup)

    test('bootstrap: no _derived key — preserves existing, adds new fields, writes _derived', async () => {
        // Existing config has lang.node manually set, project also has Cargo.toml
        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'tsconfig.json': '{}',
            'Cargo.toml': '[package]\nname = "test"',
            'rct.config.json': JSON.stringify({
                lang: { node: { tools: [{ name: 'bun', scripts: true }] } },
            }),
        })

        await runUpdate()

        const config = readJSON(path.join(TMP_DIR, 'rct.config.json'))

        // Existing lang preserved (not overwritten)
        expect(config.lang).toEqual({
            node: { tools: [{ name: 'bun', scripts: true }] },
        })

        // New field: test was added (not in existing config)
        expect(config.test).toBeDefined()
        expect((config.test as any).command).toContain('bun test')

        // _derived baseline written
        expect(config._derived).toBeDefined()
        const derived = config._derived as Record<string, unknown>
        expect(derived.lang).toBeDefined()
        expect((derived.lang as any).rust).toBeDefined()
    })

    test('derived field unchanged by consumer — updated with fresh derivation', async () => {
        // Simulate: first update created _derived with bun, now project switched to pnpm
        const originalLang = {
            node: {
                tools: [{ name: 'bun', scripts: true }],
                config: [
                    {
                        name: 'tsconfig',
                        path: 'tsconfig.json',
                        extractPaths: true,
                    },
                ],
            },
        }

        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'pnpm test' },
            }),
            'pnpm-lock.yaml': '',
            'tsconfig.json': '{}',
            'rct.config.json': JSON.stringify({
                lang: originalLang,
                test: { command: 'bun test', injectOn: 'SessionStart' },
                _derived: {
                    lang: originalLang,
                    test: { command: 'bun test', injectOn: 'SessionStart' },
                    files: [],
                    globals: {},
                },
            }),
        })

        await runUpdate()

        const config = readJSON(path.join(TMP_DIR, 'rct.config.json'))

        // lang updated to pnpm (was unchanged from _derived baseline)
        expect((config.lang as any).node.tools[0].name).toBe('pnpm')

        // test updated too
        expect((config.test as any).command).toBe('pnpm test')
    })

    test('derived field modified by consumer — preserved', async () => {
        // Consumer customized lang.node by adding extra tools
        const derivedLang = {
            node: {
                tools: [{ name: 'bun', scripts: true }],
                config: [
                    {
                        name: 'tsconfig',
                        path: 'tsconfig.json',
                        extractPaths: true,
                    },
                ],
            },
        }
        const customizedLang = {
            node: {
                tools: [{ name: 'bun', scripts: true, workspace: true }],
                config: [
                    {
                        name: 'tsconfig',
                        path: 'tsconfig.json',
                        extractPaths: true,
                    },
                ],
            },
        }

        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'tsconfig.json': '{}',
            'rct.config.json': JSON.stringify({
                lang: customizedLang,
                test: { command: 'bun test', injectOn: 'SessionStart' },
                _derived: {
                    lang: derivedLang,
                    test: { command: 'bun test', injectOn: 'SessionStart' },
                    files: [],
                    globals: {},
                },
            }),
        })

        await runUpdate()

        const config = readJSON(path.join(TMP_DIR, 'rct.config.json'))

        // Consumer customization preserved (workspace: true kept)
        expect((config.lang as any).node.tools[0].workspace).toBe(true)
    })

    test('project marker removed — derived section removed', async () => {
        // Had Cargo.toml before, now removed
        const originalLang = {
            node: {
                tools: [{ name: 'bun', scripts: true }],
                config: [
                    {
                        name: 'tsconfig',
                        path: 'tsconfig.json',
                        extractPaths: true,
                    },
                ],
            },
            rust: { tools: [{ name: 'cargo' }] },
        }

        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'tsconfig.json': '{}',
            // No Cargo.toml — rust should be removed
            'rct.config.json': JSON.stringify({
                lang: originalLang,
                test: {
                    command: 'bun test && cargo test',
                    injectOn: 'SessionStart',
                },
                _derived: {
                    lang: originalLang,
                    test: {
                        command: 'bun test && cargo test',
                        injectOn: 'SessionStart',
                    },
                    files: [],
                    globals: {},
                },
            }),
        })

        await runUpdate()

        const config = readJSON(path.join(TMP_DIR, 'rct.config.json'))

        // lang updated: rust removed (was unchanged from derived)
        expect((config.lang as any).rust).toBeUndefined()
        expect((config.lang as any).node).toBeDefined()

        // test updated: no more cargo test
        expect((config.test as any).command).toBe('bun test')
    })

    test('new project marker added — new section added', async () => {
        // Started with just node, now added Cargo.toml
        const nodeLang = {
            node: {
                tools: [{ name: 'bun', scripts: true }],
                config: [
                    {
                        name: 'tsconfig',
                        path: 'tsconfig.json',
                        extractPaths: true,
                    },
                ],
            },
        }

        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'tsconfig.json': '{}',
            'Cargo.toml': '[package]\nname = "test"',
            'rct.config.json': JSON.stringify({
                lang: nodeLang,
                test: { command: 'bun test', injectOn: 'SessionStart' },
                _derived: {
                    lang: nodeLang,
                    test: { command: 'bun test', injectOn: 'SessionStart' },
                    files: [],
                    globals: {},
                },
            }),
        })

        await runUpdate()

        const config = readJSON(path.join(TMP_DIR, 'rct.config.json'))

        // lang updated: now includes rust (lang was unchanged from derived)
        expect((config.lang as any).rust).toBeDefined()
        expect((config.lang as any).rust.tools[0].name).toBe('cargo')
    })

    test('_derived baseline updated after merge', async () => {
        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'tsconfig.json': '{}',
            'rct.config.json': JSON.stringify({
                lang: { node: { tools: [{ name: 'bun', scripts: true }] } },
            }),
        })

        // First update — bootstrap
        await runUpdate()

        const config1 = readJSON(path.join(TMP_DIR, 'rct.config.json'))
        expect(config1._derived).toBeDefined()

        const derived1 = config1._derived as Record<string, unknown>
        const freshLang1 = derived1.lang as any
        expect(freshLang1.node).toBeDefined()

        // Now add Cargo.toml and run again
        writeFileSync(path.join(TMP_DIR, 'Cargo.toml'), '[package]\nname = "x"')

        await runUpdate()

        const config2 = readJSON(path.join(TMP_DIR, 'rct.config.json'))
        const derived2 = config2._derived as Record<string, unknown>

        // _derived now includes rust
        expect((derived2.lang as any).rust).toBeDefined()
        expect((derived2.test as any).command).toContain('cargo test')
    })

    test('settings.json updated alongside config', async () => {
        setup({
            'package.json': JSON.stringify({
                name: 'test-app',
                version: '1.0.0',
                scripts: { test: 'bun test' },
            }),
            'bun.lock': '',
            'rct.config.json': JSON.stringify({}),
        })

        await runUpdate()

        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        expect(existsSync(settingsPath)).toBe(true)

        const settings = readJSON(settingsPath)
        expect(settings.hooks).toBeDefined()
        expect((settings.hooks as any).SessionStart).toBeDefined()
    })
})
