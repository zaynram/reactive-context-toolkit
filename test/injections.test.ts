import { describe, test, expect, spyOn } from 'bun:test'
import { evaluateInjections } from '../src/engine/injections'
import type { InjectionEntry, GlobalsConfig } from '../src/config/types'
import type { FileRegistry, ReferenceFile } from '../src/types'

function makeRef(
    alias: string,
    content: string,
    brief?: string,
): ReferenceFile {
    return { alias, path: `/project/${alias}.xml`, brief, read: () => content }
}

function makeRegistry(refs: ReferenceFile[]): FileRegistry {
    const map = new Map<string, ReferenceFile>()
    for (const r of refs) map.set(r.alias, r)

    return {
        get(alias: string) {
            return map.get(alias)
        },
        getRef(ref: string) {
            let useBrief = false
            let key = ref
            if (key.endsWith('~brief')) {
                useBrief = true
                key = key.slice(0, -6)
            }
            if (key.includes(':')) {
                // meta file lookup
                const file = map.get(key)
                return file ? { file, useBrief } : undefined
            }
            const file = map.get(key)
            return file ? { file, useBrief } : undefined
        },
        select(...aliases: string[]) {
            return aliases
                .map((a) => map.get(a))
                .filter((f): f is ReferenceFile => !!f)
        },
        all() {
            return Array.from(map.values())
        },
        matchPath(filePath: string) {
            for (const f of map.values()) {
                if (f.path === filePath) return f
            }
            return undefined
        },
    }
}

const defaultGlobals: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}

describe('evaluateInjections', () => {
    const choresRef = makeRef(
        'chores',
        '<chores>Fix tests</chores>',
        'Active chores',
    )
    const scopeRef = makeRef('scope', '<scope>RCT v1</scope>')
    const registry = makeRegistry([choresRef, scopeRef])

    test('returns empty array when nothing matches', () => {
        const injection: InjectionEntry = {
            on: 'PostToolUse',
            matcher: 'Read',
            inject: ['chores'],
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Read',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toEqual([])
    })

    test('returns file content for matching injection', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['chores'],
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('Fix tests')
    })

    test('brief: true uses brief field', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['chores'],
            brief: true,
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('Active chores')
        expect(result[0]).not.toContain('Fix tests')
    })

    test('~brief suffix on individual ref', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['chores~brief'],
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('Active chores')
    })

    test('matchFile triggers on file path match', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            matchFile: 'chores',
            inject: ['chores'],
        }
        // Matching path
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Read',
            { tool_input: { file_path: '/project/chores.xml' } },
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)

        // Non-matching path
        const result2 = evaluateInjections(
            [injection],
            'PreToolUse',
            'Read',
            { tool_input: { file_path: '/other/file.xml' } },
            registry,
            defaultGlobals,
        )
        expect(result2).toEqual([])
    })

    test('match condition on user prompt', () => {
        const injection: InjectionEntry = {
            on: 'UserPromptSubmit',
            match: {
                target: 'user_prompt',
                operator: 'contains',
                pattern: 'chores',
            },
            inject: ['chores'],
        }
        const result = evaluateInjections(
            [injection],
            'UserPromptSubmit',
            undefined,
            { prompt: 'show me chores' },
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('Fix tests')
    })

    test('wraps with XML by default', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['scope'],
            wrapper: 'project-scope',
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('<project-scope>')
        expect(result[0]).toContain('</project-scope>')
        expect(result[0]).toContain('RCT v1')
    })

    test("wraps with JSON when format='json'", () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['scope'],
            wrapper: 'project-scope',
            format: 'json',
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        const parsed = JSON.parse(result[0])
        expect(parsed['project-scope']).toContain('RCT v1')
    })

    test('skips disabled injections', () => {
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['chores'],
            enabled: false,
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toEqual([])
    })

    test("staleCheck wraps stale content with today's date", () => {
        const staleContent =
            '<scope><date>2020-01-01</date><focus>Old content</focus></scope>'
        const staleRef: ReferenceFile = {
            alias: 'stale',
            path: '/project/stale.xml',
            read: () => staleContent,
            staleCheck: { dateTag: 'date', wrapTag: 'stale-scope' },
        }
        const staleRegistry = makeRegistry([staleRef])
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['stale'],
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            staleRegistry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('<stale-scope')
        expect(result[0]).toContain('date="2020-01-01"')
        expect(result[0]).toContain('today=')
        expect(result[0]).toContain('Old content')
    })

    test('staleCheck skips wrapping when content is not stale', () => {
        const futureDate = '2999-12-31'
        const freshContent = `<scope><date>${futureDate}</date><focus>New content</focus></scope>`
        const freshRef: ReferenceFile = {
            alias: 'fresh',
            path: '/project/fresh.xml',
            read: () => freshContent,
            staleCheck: { dateTag: 'date', wrapTag: 'stale-scope' },
        }
        const freshRegistry = makeRegistry([freshRef])
        const injection: InjectionEntry = {
            on: 'PreToolUse',
            inject: ['fresh'],
        }
        const result = evaluateInjections(
            [injection],
            'PreToolUse',
            'Write',
            {},
            freshRegistry,
            defaultGlobals,
        )
        expect(result).toHaveLength(1)
        expect(result[0]).not.toContain('<stale-scope')
        expect(result[0]).toBe(freshContent)
    })
})

describe('evaluateInjections — unresolved FileRef warning', () => {
    test('warns and skips when FileRef does not resolve', () => {
        const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
        const registry = makeRegistry([])
        const injection: InjectionEntry = {
            on: 'SessionStart',
            inject: ['nonexistent'],
        }
        const result = evaluateInjections(
            [injection],
            'SessionStart',
            undefined,
            {},
            registry,
            defaultGlobals,
        )
        expect(result).toHaveLength(0)
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("FileRef 'nonexistent' did not resolve"),
        )
        warnSpy.mockRestore()
    })
})
