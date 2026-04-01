import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import path from 'path'
import { detectProject, generateConfig, mergeSettings } from '../src/cli/init'

const TMP_DIR = path.resolve(__dirname, '../.tmp-init-test')

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

describe('detectProject', () => {
    beforeEach(cleanup)
    afterEach(cleanup)

    test('finds tsconfig and bun lock -> typescript with bun', () => {
        setup({
            'tsconfig.json': '{}',
            'package.json':
                '{"name":"test","version":"1.0.0","scripts":{"test":"bun test"}}',
            'bun.lock': '',
        })
        const result = detectProject(TMP_DIR)
        expect(result.lang.typescript).toBeDefined()
        expect(result.lang.typescript!.tools).toHaveLength(1)
        expect(result.lang.typescript!.tools![0].name).toBe('bun')
        expect(result.lang.typescript!.tools![0].scripts).toBe(true)
        expect(result.lang.typescript!.config).toHaveLength(1)
        expect(result.lang.typescript!.config![0].name).toBe('tsconfig')
        expect(result.testCommand).toBe('bun test')
    })

    test('finds pixi.toml -> python with pixi', () => {
        setup({ 'pixi.toml': "[project]\nname = 'test'" })
        const result = detectProject(TMP_DIR)
        expect(result.lang.python).toBeDefined()
        expect(result.lang.python!.tools).toHaveLength(1)
        expect(result.lang.python!.tools![0].name).toBe('pixi')
        expect(result.lang.python!.tools![0].tasks).toBe(true)
        expect(result.lang.python!.tools![0].environment).toBe(true)
        expect(result.testCommand).toBe('pixi run test')
    })

    test('finds Cargo.toml -> rust with cargo', () => {
        setup({ 'Cargo.toml': "[package]\nname = 'test'" })
        const result = detectProject(TMP_DIR)
        expect(result.lang.rust).toBeDefined()
        expect(result.lang.rust!.tools![0].name).toBe('cargo')
        expect(result.testCommand).toBe('cargo test')
    })

    test('files list is empty (file detection is plugin-driven, not auto-detected)', () => {
        setup({ 'dev/chores.xml': '<chores/>', 'dev/scope.xml': '<scope/>' })
        const result = detectProject(TMP_DIR)
        expect(result.files).toHaveLength(0)
    })

    test('finds npm lock -> npm', () => {
        setup({
            'tsconfig.json': '{}',
            'package.json':
                '{"name":"test","version":"1.0.0","scripts":{"test":"npm test"}}',
            'package-lock.json': '{}',
        })
        const result = detectProject(TMP_DIR)
        expect(result.lang.typescript!.tools![0].name).toBe('npm')
        expect(result.testCommand).toBe('npm test')
    })

    test('finds pnpm lock -> pnpm', () => {
        setup({
            'tsconfig.json': '{}',
            'package.json':
                '{"name":"test","version":"1.0.0","scripts":{"test":"pnpm test"}}',
            'pnpm-lock.yaml': '',
        })
        const result = detectProject(TMP_DIR)
        expect(result.lang.typescript!.tools![0].name).toBe('pnpm')
        expect(result.testCommand).toBe('pnpm test')
    })

    test('empty directory detects nothing', () => {
        setup({})
        const result = detectProject(TMP_DIR)
        expect(Object.keys(result.lang)).toHaveLength(0)
        expect(result.testCommand).toBeNull()
        expect(result.files).toHaveLength(0)
    })
})

describe('generateConfig', () => {
    test('produces valid RCTConfig from detection', () => {
        const config = generateConfig({
            lang: {
                typescript: {
                    tools: [{ name: 'bun', scripts: true }],
                    config: [
                        {
                            name: 'tsconfig',
                            path: 'tsconfig.json',
                            extractPaths: true,
                        },
                    ],
                },
            },
            testCommand: 'bun test',
            files: [{ alias: 'chores', path: 'dev/chores.xml' }],
        })
        expect(config.lang).toBeDefined()
        expect(config.lang!.typescript).toBeDefined()
        expect(config.test).toEqual({
            command: 'bun test',
            injectOn: 'SessionStart',
        })
        expect(config.files).toHaveLength(1)
        expect(config.files![0].alias).toBe('chores')
        expect(config.files![0].injectOn).toBe('SessionStart')
    })

    test('omits lang if empty', () => {
        const config = generateConfig({
            lang: {},
            testCommand: null,
            files: [],
        })
        expect(config.lang).toBeUndefined()
        expect(config.test).toBeUndefined()
        expect(config.files).toBeUndefined()
    })
})

describe('mergeSettings', () => {
    beforeEach(cleanup)
    afterEach(cleanup)

    test('adds hooks without overwriting existing settings', async () => {
        setup({})
        const settingsDir = path.join(TMP_DIR, '.claude')
        mkdirSync(settingsDir, { recursive: true })
        const settingsPath = path.join(settingsDir, 'settings.json')
        writeFileSync(
            settingsPath,
            JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2),
        )

        await mergeSettings(settingsPath, {})

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.permissions).toEqual({ allow: ['Read'] })
        expect(result.hooks).toBeDefined()
        expect(result.hooks.SessionStart).toBeDefined()
    })

    test('creates settings file if it does not exist', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {})

        expect(existsSync(settingsPath)).toBe(true)
        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.SessionStart).toBeDefined()
    })

    test('adds PreToolUse and PostToolUse hooks when rules/injections have matchers', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')

        await mergeSettings(settingsPath, {
            rules: [
                {
                    on: 'PreToolUse',
                    matcher: 'Write|Edit',
                    match: { target: 'file_path', pattern: '.*' },
                    action: 'block',
                    message: 'no',
                },
            ],
            injections: [
                { on: 'PostToolUse', matcher: 'Read', inject: ['chores'] },
            ],
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.PreToolUse).toBeDefined()
        expect(result.hooks.PreToolUse[0].matcher).toContain('Write')
        expect(result.hooks.PostToolUse).toBeDefined()
        expect(result.hooks.PostToolUse[0].matcher).toContain('Read')
    })

    test('is idempotent -- running twice produces same result', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')

        const config = {
            rules: [
                {
                    on: 'PreToolUse' as const,
                    matcher: 'Write',
                    match: { target: 'file_path' as const, pattern: '.*' },
                    action: 'block' as const,
                    message: 'no',
                },
            ],
        }

        await mergeSettings(settingsPath, config)
        const first = readFileSync(settingsPath, 'utf-8')

        await mergeSettings(settingsPath, config)
        const second = readFileSync(settingsPath, 'utf-8')

        expect(first).toBe(second)
    })
})
