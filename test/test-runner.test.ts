import { describe, expect, test } from 'bun:test'
import {
    resolveTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
} from '#test/runner'
import type { RCTConfig, TestResult } from '#test/runner'
import type { GlobalsConfig } from '#config/types'

const defaultGlobals: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}

describe('resolveTestCommand', () => {
    test('returns string for string config', () => {
        const config: RCTConfig = { test: 'bun test --coverage' }
        expect(resolveTestCommand(config)?.command).toBe('bun test --coverage')
    })

    test('resolves "bun test" from lang.typescript with bun tool having scripts:true', () => {
        const config: RCTConfig = {
            test: true,
            lang: { typescript: { tools: [{ name: 'bun', scripts: true }] } },
        }
        expect(resolveTestCommand(config)?.command).toBe('bun test')
    })

    test('resolves pixi run test for pixi tool', () => {
        const config: RCTConfig = {
            test: true,
            lang: { python: { tools: [{ name: 'pixi', tasks: true }] } },
        }
        expect(resolveTestCommand(config)?.command).toBe('pixi run test')
    })

    test('resolves cargo test for cargo tool', () => {
        const config: RCTConfig = {
            test: true,
            lang: { rust: { tools: [{ name: 'cargo', tasks: true }] } },
        }
        expect(resolveTestCommand(config)?.command).toBe('cargo test')
    })

    test('returns null when no test configured', () => {
        const config: RCTConfig = {}
        expect(resolveTestCommand(config)).toBeNull()
    })

    test('returns null when test is false', () => {
        const config: RCTConfig = { test: false }
        expect(resolveTestCommand(config)).toBeNull()
    })

    test('returns command from TestConfig object', () => {
        const config: RCTConfig = { test: { command: 'pytest -x' } }
        expect(resolveTestCommand(config)?.command).toBe('pytest -x')
        expect(resolveTestCommand(config)?.tool).toBe('custom')
    })

    test('auto-detects when TestConfig.command is true', () => {
        const config: RCTConfig = {
            test: { command: true },
            lang: { typescript: { tools: [{ name: 'bun', scripts: true }] } },
        }
        expect(resolveTestCommand(config)?.command).toBe('bun test')
    })
})

describe('resolveTestCommand returns tool info', () => {
    test('returns tool name for lang-detected command', () => {
        const config: RCTConfig = {
            test: true,
            lang: { typescript: { tools: [{ name: 'bun', scripts: true }] } },
        }
        const info = resolveTestCommand(config)
        expect(info).not.toBeNull()
        expect(info!.command).toBe('bun test')
        expect(info!.tool).toBe('bun')
    })

    test("returns 'custom' tool for explicit command string", () => {
        const config: RCTConfig = { test: 'pytest -x' }
        const info = resolveTestCommand(config)
        expect(info!.command).toBe('pytest -x')
        expect(info!.tool).toBe('custom')
    })

    test('returns cargo tool for rust lang', () => {
        const config: RCTConfig = {
            test: true,
            lang: { rust: { tools: [{ name: 'cargo', tasks: true }] } },
        }
        const info = resolveTestCommand(config)
        expect(info!.tool).toBe('cargo')
    })
})

describe('runTest', () => {
    test('returns pass for successful command', () => {
        const result = runTest('echo', '/tmp')
        expect(result.status).toBe('pass')
        expect(result.exitCode).toBe(0)
    })

    test('returns fail for failing command', () => {
        const result = runTest('false', '/tmp')
        expect(result.status).toBe('fail')
        expect(result.exitCode).not.toBe(0)
    })

    test('returns fail for nonexistent command', () => {
        const result = runTest('nonexistent_command_xyz_123', '/tmp')
        expect(result.status).toBe('fail')
        expect(result.exitCode).not.toBe(0)
    })
})

describe('formatTestResult', () => {
    test('uses brief template', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: 'all good',
        }
        const formatted = formatTestResult(
            result,
            {
                command: 'bun test',
                brief: 'Result: {status} (code {exitCode})',
            },
            defaultGlobals,
        )
        expect(formatted).toBe('Result: pass (code 0)')
    })

    test('xml format pass produces self-closing test tag', () => {
        const result: TestResult = { status: 'pass', exitCode: 0, output: '' }
        const out = formatTestResult(
            result,
            { command: 'bun test' },
            defaultGlobals,
        )
        expect(out).toContain('<test')
        expect(out).toContain('status="pass"')
    })

    test('xml format fail includes exitCode', () => {
        const result: TestResult = {
            status: 'fail',
            exitCode: 1,
            output: 'error',
        }
        const out = formatTestResult(
            result,
            { command: 'bun test' },
            defaultGlobals,
        )
        expect(out).toContain('status="fail"')
        expect(out).toContain('exitCode="1"')
    })
})

describe('formatTestResult with format', () => {
    test('xml format pass produces self-closing test tag with tool and status', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'bun',
        }
        const out = formatTestResult(
            result,
            { command: 'bun test' },
            defaultGlobals,
        )
        expect(out).toContain('<test')
        expect(out).toContain('tool="bun"')
        expect(out).toContain('status="pass"')
    })

    test('xml format fail includes exitCode attribute', () => {
        const result: TestResult = {
            status: 'fail',
            exitCode: 1,
            output: '',
            tool: 'bun',
        }
        const out = formatTestResult(
            result,
            { command: 'bun test' },
            defaultGlobals,
        )
        expect(out).toContain('exitCode="1"')
    })

    test('json format produces json object with tool and status', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'cargo',
        }
        const jsonGlobals = { ...defaultGlobals, format: 'json' as const }
        const out = formatTestResult(
            result,
            { command: 'cargo test' },
            jsonGlobals,
        )
        const parsed = JSON.parse(out)
        expect(parsed.test.tool).toBe('cargo')
        expect(parsed.test.status).toBe('pass')
    })

    test('brief template supports {tool} substitution', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'pixi',
        }
        const out = formatTestResult(
            result,
            { command: 'pixi run test', brief: '[{tool}] {status}' },
            defaultGlobals,
        )
        expect(out).toBe('[pixi] pass')
    })

    test('TestConfig.format overrides globals.format', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'bun',
        }
        const out = formatTestResult(
            result,
            { command: 'bun test', format: 'json' },
            defaultGlobals,
        )
        const parsed = JSON.parse(out)
        expect(parsed.test).toBeDefined()
    })
})

describe('cache', () => {
    test('returns null for uncached result', () => {
        const result = getCachedResult('session-xyz-999', 'bun test', 300)
        expect(result).toBeNull()
    })

    test('stores and retrieves cached result', async () => {
        const testResult: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: 'ok',
        }
        const sessionId = `test-cache-${Date.now()}`
        await setCachedResult(sessionId, 'bun test', testResult)
        const cached = getCachedResult(sessionId, 'bun test', 300)
        expect(cached).not.toBeNull()
        expect(cached!.status).toBe('pass')
        expect(cached!.exitCode).toBe(0)
    })
})
