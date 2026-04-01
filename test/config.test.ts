import { describe, test, expect } from 'bun:test'
import type {
    HookEvent,
    HookEventOrArray,
    Format,
    FileRef,
    GlobalsConfig,
    MetaFileEntry,
    FileEntry,
    MatchTarget,
    MatchOperator,
    MatchCondition,
    Match,
    RuleEntry,
    InjectionEntry,
    LangConfigFile,
    LangToolName,
    LangTool,
    LangEntry,
    LangConfig,
    TestConfig,
    MetaConfig,
    RCTConfig,
} from '../src/config/types'

// Helper: compile-time assertion that a value satisfies a type
// If types.ts is missing or wrong, these will produce TS errors and bun test will fail.

describe('RCT Config Types', () => {
    test('HookEvent accepts all valid events', () => {
        const events: HookEvent[] = [
            'PreToolUse',
            'PostToolUse',
            'PostToolUseFailure',
            'SessionStart',
            'UserPromptSubmit',
            'Setup',
            'SubagentStart',
            'Notification',
        ]
        expect(events).toHaveLength(8)
    })

    test('HookEventOrArray accepts single or array', () => {
        const single: HookEventOrArray = 'PreToolUse'
        const array: HookEventOrArray = ['PreToolUse', 'PostToolUse']
        expect(single).toBe('PreToolUse')
        expect(array).toHaveLength(2)
    })

    test('Format accepts xml and json', () => {
        const xml: Format = 'xml'
        const json: Format = 'json'
        expect(xml).toBe('xml')
        expect(json).toBe('json')
    })

    test('FileRef is a string', () => {
        const ref: FileRef = 'myAlias:metaAlias~brief'
        expect(typeof ref).toBe('string')
    })

    test('GlobalsConfig', () => {
        const globals: GlobalsConfig = {
            format: 'xml',
            wrapper: 'context',
            briefByDefault: false,
        }
        expect(globals.format).toBe('xml')

        // All fields optional
        const empty: GlobalsConfig = {}
        expect(empty).toEqual({})
    })

    test('MetaFileEntry', () => {
        const entry: MetaFileEntry = {
            path: '/some/path.md',
            alias: 'docs',
            injectOn: 'SessionStart',
            brief: 'Short summary',
        }
        expect(entry.path).toBe('/some/path.md')

        // Minimal
        const minimal: MetaFileEntry = { path: 'file.txt' }
        expect(minimal.path).toBe('file.txt')

        // injectOn as array
        const withArray: MetaFileEntry = {
            path: 'f.txt',
            injectOn: ['SessionStart', 'PreToolUse'],
        }
        expect(withArray.injectOn).toHaveLength(2)
    })

    test('FileEntry extends MetaFileEntry with staleCheck and metaFiles', () => {
        const entry: FileEntry = {
            path: 'src/index.ts',
            alias: 'main',
            staleCheck: {
                dateTag: 'last-updated',
                wrapTag: 'file-content',
                format: 'YYYY-MM-DD',
            },
            metaFiles: [{ path: 'meta.md', alias: 'meta' }],
        }
        expect(entry.staleCheck?.dateTag).toBe('last-updated')
        expect(entry.metaFiles).toHaveLength(1)
    })

    test('MatchCondition and Match', () => {
        const condition: MatchCondition = {
            target: 'file_path',
            operator: 'regex',
            pattern: '.*\\.ts$',
        }
        expect(condition.target).toBe('file_path')

        // pattern can be array of strings or objects
        const condWithArrayPattern: MatchCondition = {
            target: 'tool_name',
            pattern: ['Write', { name: 'Edit', path: '/src' }],
        }
        expect(condWithArrayPattern.pattern).toHaveLength(2)

        // Match can be single or array
        const singleMatch: Match = condition
        const arrayMatch: Match = [condition, condWithArrayPattern]
        expect(Array.isArray(arrayMatch)).toBe(true)
        expect(Array.isArray(singleMatch)).toBe(false)
    })

    test('MatchTarget covers all values', () => {
        const targets: MatchTarget[] = [
            'file_path',
            'new_string',
            'content',
            'command',
            'user_prompt',
            'tool_name',
            'error',
        ]
        expect(targets).toHaveLength(7)
    })

    test('MatchOperator covers all values', () => {
        const ops: MatchOperator[] = [
            'regex',
            'contains',
            'equals',
            'not_contains',
            'starts_with',
            'ends_with',
            'glob',
        ]
        expect(ops).toHaveLength(7)
    })

    test('RuleEntry', () => {
        const rule: RuleEntry = {
            enabled: true,
            description: 'Block writing to node_modules',
            on: 'PreToolUse',
            matcher: 'Write|Edit',
            match: {
                target: 'file_path',
                operator: 'contains',
                pattern: 'node_modules',
            },
            action: 'block',
            message: 'Do not write to node_modules',
        }
        expect(rule.action).toBe('block')

        // Minimal rule
        const minimal: RuleEntry = {
            on: 'PostToolUse',
            match: { target: 'error', pattern: '.*' },
            action: 'warn',
            message: 'Something went wrong',
        }
        expect(minimal.on).toBe('PostToolUse')
    })

    test('InjectionEntry', () => {
        const injection: InjectionEntry = {
            enabled: true,
            description: 'Inject docs on file edit',
            on: 'PreToolUse',
            matcher: 'Edit',
            matchFile: 'src/**/*.ts',
            match: { target: 'file_path', pattern: '\\.ts$' },
            inject: ['docs~brief', 'guidelines'],
            brief: true,
            wrapper: 'reference',
            format: 'xml',
        }
        expect(injection.inject).toHaveLength(2)

        // Minimal
        const minimal: InjectionEntry = {
            on: 'SessionStart',
            inject: ['readme'],
        }
        expect(minimal.inject).toHaveLength(1)
    })

    test('LangConfigFile', () => {
        const cfg: LangConfigFile = {
            name: 'tsconfig',
            path: 'tsconfig.json',
            inject: true,
            extractPaths: true,
        }
        expect(cfg.name).toBe('tsconfig')
    })

    test('LangToolName covers all values', () => {
        const tools: LangToolName[] = [
            'bun',
            'npm',
            'pnpm',
            'pixi',
            'uv',
            'pip',
            'pipx',
            'cargo',
            'cargo-binstall',
            'rustup',
        ]
        expect(tools).toHaveLength(10)
    })

    test('LangTool', () => {
        const tool: LangTool = {
            name: 'bun',
            tasks: true,
            environment: true,
            workspace: true,
            scripts: true,
            manifest: 'package.json',
            lockfile: 'bun.lock',
            config: 'bunfig.toml',
            injectOn: ['SessionStart'],
        }
        expect(tool.name).toBe('bun')
    })

    test('LangEntry', () => {
        const entry: LangEntry = {
            tools: [{ name: 'npm' }],
            config: [{ name: 'tsconfig', path: 'tsconfig.json' }],
            injectOn: 'SessionStart',
            format: 'json',
        }
        expect(entry.tools).toHaveLength(1)
    })

    test('LangConfig', () => {
        const lang: LangConfig = {
            typescript: { tools: [{ name: 'bun' }] },
            python: { tools: [{ name: 'uv' }, { name: 'pixi' }] },
        }
        expect(lang.typescript?.tools).toHaveLength(1)
    })

    test('TestConfig', () => {
        const tc: TestConfig = {
            command: 'bun test',
            injectOn: 'PreToolUse',
            cache: true,
            cacheTTL: 60,
            brief: 'Test results summary',
            format: 'xml',
        }
        expect(tc.command).toBe('bun test')

        // command can be true
        const tcTrue: TestConfig = { command: true }
        expect(tcTrue.command).toBe(true)
    })

    test('MetaConfig', () => {
        const meta: MetaConfig = {
            injectOn: ['SessionStart'],
            include: ['files', 'lang', 'test', 'rules'],
            brief: true,
            contents: { enumeration: 'xml' },
        }
        expect(meta.include).toHaveLength(4)
    })

    test('RCTConfig full config satisfies type', () => {
        const config = {
            globals: {
                format: 'xml',
                wrapper: 'context',
                briefByDefault: false,
            },
            files: [
                {
                    path: 'CLAUDE.md',
                    alias: 'claude',
                    injectOn: 'SessionStart',
                    staleCheck: { dateTag: 'updated', wrapTag: 'content' },
                    metaFiles: [{ path: 'meta.md' }],
                },
            ],
            lang: {
                typescript: {
                    tools: [{ name: 'bun', tasks: true }],
                    config: [{ name: 'tsconfig', path: 'tsconfig.json' }],
                },
            },
            test: { command: 'bun test', cache: true, cacheTTL: 30 },
            rules: [
                {
                    on: 'PreToolUse',
                    match: { target: 'file_path', pattern: 'secret' },
                    action: 'block',
                    message: 'No secrets',
                },
            ],
            injections: [{ on: 'PreToolUse', inject: ['docs'] }],
            meta: {
                injectOn: 'SessionStart',
                include: ['files'],
                brief: false,
            },
        } satisfies RCTConfig

        expect(config.globals?.format).toBe('xml')
        expect(config.files).toHaveLength(1)
        expect(config.rules).toHaveLength(1)
    })

    test('RCTConfig test field accepts boolean, string, or TestConfig', () => {
        const c1: RCTConfig = { test: true }
        const c2: RCTConfig = { test: 'bun test' }
        const c3: RCTConfig = { test: { command: 'bun test' } }
        expect(c1.test).toBe(true)
        expect(c2.test).toBe('bun test')
        expect(typeof c3.test).toBe('object')
    })

    test('RCTConfig empty config is valid', () => {
        const empty: RCTConfig = {}
        expect(empty).toEqual({})
    })
})
