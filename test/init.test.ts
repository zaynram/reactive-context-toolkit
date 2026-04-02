import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import path from 'path'
import {
    detectProject,
    generateConfig,
    mergeSettings,
    discoverPlugins,
} from '../src/cli/init'

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

    test('finds tsconfig and bun lock -> node with bun', () => {
        setup({
            'tsconfig.json': '{}',
            'package.json':
                '{"name":"test","version":"1.0.0","scripts":{"test":"bun test"}}',
            'bun.lock': '',
        })
        const result = detectProject(TMP_DIR)
        expect(result.lang.node).toBeDefined()
        expect(result.lang.node!.tools).toHaveLength(1)
        expect(result.lang.node!.tools![0].name).toBe('bun')
        expect(result.lang.node!.tools![0].scripts).toBe(true)
        expect(result.lang.node!.config).toHaveLength(1)
        expect(result.lang.node!.config![0].name).toBe('tsconfig')
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
        expect(result.lang.node!.tools![0].name).toBe('npm')
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
        expect(result.lang.node!.tools![0].name).toBe('pnpm')
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
            },
            testCommand: 'bun test',
            files: [{ alias: 'chores', path: 'dev/chores.xml' }],
        })
        expect(config.lang).toBeDefined()
        expect(config.lang!.node).toBeDefined()
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

    test('SessionStart always included even with empty config', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {})

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.SessionStart).toBeDefined()
        expect(result.hooks.SessionStart[0].hooks[0].command).toContain(
            'SessionStart',
        )
    })

    test('config with files[].injectOn generates hook entry', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            files: [
                { alias: 'readme', path: 'README.md', injectOn: 'PostToolUse' },
            ],
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.PostToolUse).toBeDefined()
        expect(result.hooks.PostToolUse[0].hooks[0].command).toContain(
            'PostToolUse',
        )
    })

    test('config with lang entry injectOn generates hook entry', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            lang: {
                node: { tools: [{ name: 'bun' }], injectOn: 'PreToolUse' },
            },
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.PreToolUse).toBeDefined()
        expect(result.hooks.PreToolUse[0].hooks[0].command).toContain(
            'PreToolUse',
        )
    })

    test('config with lang tool injectOn generates hook entry', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            lang: {
                node: {
                    tools: [{ name: 'bun', injectOn: 'UserPromptSubmit' }],
                },
            },
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.UserPromptSubmit).toBeDefined()
        expect(result.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
            'UserPromptSubmit',
        )
    })

    test('config with test.injectOn generates hook entry', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            test: { command: 'bun test', injectOn: 'UserPromptSubmit' },
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.UserPromptSubmit).toBeDefined()
        expect(result.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
            'UserPromptSubmit',
        )
    })

    test('config with meta.injectOn generates hook entry', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            meta: { injectOn: 'SubagentStart' },
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.SubagentStart).toBeDefined()
        expect(result.hooks.SubagentStart[0].hooks[0].command).toContain(
            'SubagentStart',
        )
    })

    test('config with rules on PreToolUse generates PreToolUse with matcher', async () => {
        setup({})
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json')
        await mergeSettings(settingsPath, {
            rules: [
                {
                    on: 'PreToolUse',
                    matcher: 'Write|Edit',
                    match: { target: 'file_path', pattern: '.*\\.lock$' },
                    action: 'block',
                    message: 'Do not modify lockfiles',
                },
            ],
        })

        const result = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        expect(result.hooks.PreToolUse).toBeDefined()
        expect(result.hooks.PreToolUse[0].matcher).toContain('Write')
        expect(result.hooks.PreToolUse[0].matcher).toContain('Edit')
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

describe('discoverPlugins', () => {
    beforeEach(cleanup)
    afterEach(cleanup)

    test('finds built-in plugin names', () => {
        setup({})
        const result = discoverPlugins(TMP_DIR)
        expect(result).toContain('rct-plugin-issue-scope')
        expect(result).toContain('rct-plugin-track-work')
        expect(result).toContain('rct-plugin-tmux')
    })

    test('finds local plugin files in .claude/hooks/rct/', () => {
        setup({
            '.claude/hooks/rct/my-plugin.ts': 'export default {}',
            '.claude/hooks/rct/another.js': 'module.exports = {}',
        })
        const result = discoverPlugins(TMP_DIR)
        expect(result).toContain('.claude/hooks/rct/my-plugin.ts')
        expect(result).toContain('.claude/hooks/rct/another.js')
    })

    test('finds installed rct-plugin-* packages', () => {
        setup({
            'node_modules/rct-plugin-foo/index.js': 'module.exports = {}',
            'node_modules/rct-plugin-bar/index.js': 'module.exports = {}',
        })
        const result = discoverPlugins(TMP_DIR)
        expect(result).toContain('rct-plugin-foo')
        expect(result).toContain('rct-plugin-bar')
    })

    test('returns only built-in plugins when no local or installed plugins exist', () => {
        setup({})
        const result = discoverPlugins(TMP_DIR)
        expect(result).toHaveLength(4) // issue-scope, track-work, tmux, tasktools
    })
})

describe('initializeRCT', () => {
    beforeEach(cleanup)
    afterEach(cleanup)

    test('non-interactive mode produces config with derived defaults', async () => {
        setup({
            'tsconfig.json': '{}',
            'package.json':
                '{"name":"test","version":"1.0.0","scripts":{"test":"bun test"}}',
            'bun.lock': '',
        })

        // Run initializeRCT in non-interactive mode by setting env and importing
        const origDir = process.env.CLAUDE_PROJECT_DIR
        const origIsTTY = process.stdin.isTTY
        try {
            process.env.CLAUDE_PROJECT_DIR = TMP_DIR
            // Force non-TTY
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
            })

            const { default: initializeRCT } = await import('../src/cli/init')
            await initializeRCT([])

            const configPath = path.join(TMP_DIR, 'rct.config.json')
            expect(existsSync(configPath)).toBe(true)

            const config = JSON.parse(readFileSync(configPath, 'utf-8'))
            expect(config.lang).toBeDefined()
            expect(config.lang.node).toBeDefined()
            expect(config.globals).toBeDefined()
            expect(config.globals.format).toBe('xml')
        } finally {
            if (origDir !== undefined) {
                process.env.CLAUDE_PROJECT_DIR = origDir
            } else {
                delete process.env.CLAUDE_PROJECT_DIR
            }
            Object.defineProperty(process.stdin, 'isTTY', {
                value: origIsTTY,
                configurable: true,
            })
        }
    })

    test('_derived key is written to config', async () => {
        setup({ 'Cargo.toml': "[package]\nname = 'test'" })

        const origDir = process.env.CLAUDE_PROJECT_DIR
        const origIsTTY = process.stdin.isTTY
        try {
            process.env.CLAUDE_PROJECT_DIR = TMP_DIR
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
            })

            const { default: initializeRCT } = await import('../src/cli/init')
            await initializeRCT([])

            const configPath = path.join(TMP_DIR, 'rct.config.json')
            const config = JSON.parse(readFileSync(configPath, 'utf-8'))
            expect(config._derived).toBeDefined()
            expect(config._derived.lang).toBeDefined()
            expect(config._derived.lang.rust).toBeDefined()
            expect(config._derived.test).toBeDefined()
            expect(config._derived.test.command).toBe('cargo test')
        } finally {
            if (origDir !== undefined) {
                process.env.CLAUDE_PROJECT_DIR = origDir
            } else {
                delete process.env.CLAUDE_PROJECT_DIR
            }
            Object.defineProperty(process.stdin, 'isTTY', {
                value: origIsTTY,
                configurable: true,
            })
        }
    })

    test('re-run on existing config aborts in non-interactive mode', async () => {
        setup({ 'rct.config.json': '{"globals":{}}' })

        const origDir = process.env.CLAUDE_PROJECT_DIR
        const origIsTTY = process.stdin.isTTY
        const logs: string[] = []
        const origLog = console.log
        try {
            process.env.CLAUDE_PROJECT_DIR = TMP_DIR
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
            })
            console.log = (...args: any[]) => logs.push(args.join(' '))

            const { default: initializeRCT } = await import('../src/cli/init')
            await initializeRCT(['--yes'])

            // Config should be unchanged
            const configPath = path.join(TMP_DIR, 'rct.config.json')
            const config = JSON.parse(readFileSync(configPath, 'utf-8'))
            expect(config).toEqual({ globals: {} })
            expect(logs.some((l) => l.includes('already exists'))).toBe(true)
        } finally {
            console.log = origLog
            if (origDir !== undefined) {
                process.env.CLAUDE_PROJECT_DIR = origDir
            } else {
                delete process.env.CLAUDE_PROJECT_DIR
            }
            Object.defineProperty(process.stdin, 'isTTY', {
                value: origIsTTY,
                configurable: true,
            })
        }
    })
})
