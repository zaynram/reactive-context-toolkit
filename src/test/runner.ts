import { execSync } from 'child_process'
import type {
    RCTConfig,
    TestConfig,
    LangEntry,
    LangTestConfig,
    Format,
    GlobalsConfig,
} from '#config/types'
import { xml, fs } from '#util'

export type { RCTConfig }

export interface TestResult {
    status: 'pass' | 'fail'
    exitCode: number
    output: string
    tool?: string
    lang?: string
}

export interface TestCommandInfo {
    command: string
    tool: string
}

const TOOL_TEST_COMMANDS: Record<string, string> = {
    bun: 'bun test',
    npm: 'npm test',
    pnpm: 'pnpm test',
    pixi: 'pixi run test',
    uv: 'uv run pytest',
    pip: 'pytest',
    pipx: 'pytest',
    cargo: 'cargo test',
    'cargo-binstall': 'cargo test',
    rustup: 'cargo test',
}

function findFirstToolInfo(config: RCTConfig): TestCommandInfo | null {
    if (!config.lang) return null

    const langEntries: (LangEntry | undefined)[] = [
        config.lang.node,
        config.lang.python,
        config.lang.rust,
    ]

    for (const entry of langEntries) {
        if (!entry?.tools) continue
        for (const tool of entry.tools) {
            if (!tool.tasks && !tool.scripts) continue
            const cmd = TOOL_TEST_COMMANDS[tool.name]
            if (cmd) return { command: cmd, tool: tool.name }
        }
    }

    return null
}

function findToolInfoForEntry(entry: LangEntry): TestCommandInfo | null {
    if (!entry.tools) return null
    for (const tool of entry.tools) {
        if (!tool.tasks && !tool.scripts) continue
        const cmd = TOOL_TEST_COMMANDS[tool.name]
        if (cmd) return { command: cmd, tool: tool.name }
    }
    return null
}

/** Resolve test command from top-level config (existing v0.x behavior) */
export function resolveTestCommand(config: RCTConfig): TestCommandInfo | null {
    if (!config.test) return null

    // String shorthand
    if (typeof config.test === 'string')
        return { command: config.test, tool: 'custom' }

    // Boolean true => auto-detect
    if (config.test === true) return findFirstToolInfo(config)

    // TestConfig object
    const testConfig = config.test as TestConfig
    if (typeof testConfig.command === 'string')
        return { command: testConfig.command, tool: 'custom' }
    if (testConfig.command === true) return findFirstToolInfo(config)

    return null
}

/** Resolve test command from a per-language test config */
export function resolveLangTestCommand(
    langTest: LangTestConfig,
    entry: LangEntry,
): TestCommandInfo | null {
    if (typeof langTest.command === 'string')
        return { command: langTest.command, tool: 'custom' }
    if (langTest.command === true) return findToolInfoForEntry(entry)
    // No command specified — try auto-detect from tools
    return findToolInfoForEntry(entry)
}

export function runTest(command: string, rootDir: string): TestResult {
    try {
        const output = execSync(command, {
            encoding: 'utf-8',
            cwd: rootDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 120_000,
        })
        return { status: 'pass', exitCode: 0, output: output.trim() }
    } catch (err: any) {
        const exitCode = err?.status ?? 1
        const output = (err?.stdout ?? '') + (err?.stderr ?? '')
        return { status: 'fail', exitCode, output: output.trim() }
    }
}

export function formatTestResult(
    result: TestResult,
    testConfig: TestConfig | LangTestConfig,
    globals: Required<GlobalsConfig>,
): string {
    const brief = testConfig.brief
    if (brief) {
        return brief
            .replace(/\{status\}/g, result.status)
            .replace(/\{exitCode\}/g, String(result.exitCode))
            .replace(/\{output\}/g, result.output)
            .replace(/\{tool\}/g, result.tool ?? 'unknown')
            .replace(/\{lang\}/g, result.lang ?? 'unknown')
    }

    const format: Format = testConfig.format ?? globals.format
    const toolAttr = result.tool ?? 'unknown'
    const attrs: Record<string, string> = {
        ...(result.lang && { lang: result.lang }),
        tool: toolAttr,
        status: result.status,
        ...(result.status === 'fail' && { exitCode: String(result.exitCode) }),
    }

    if (format === 'json') {
        return JSON.stringify({
            test: {
                ...(result.lang && { lang: result.lang }),
                tool: toolAttr,
                status: result.status,
                ...(result.status === 'fail' && { exitCode: result.exitCode }),
            },
        })
    }

    return xml.inline('test', attrs)
}

// -- Cache --

function cacheDir(sessionId: string): string {
    return `/tmp/rct-cache-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function cacheKey(sessionId: string, command: string, lang?: string): string {
    const parts = [lang, command].filter(Boolean).join('_')
    const key = parts.replace(/[^a-zA-Z0-9_-]/g, '_')
    return fs.join(cacheDir(sessionId), `${key}.json`)
}

interface CacheEntry {
    result: TestResult
    timestamp: number
}

export function getCachedResult(
    sessionId: string,
    command: string,
    ttl: number,
    lang?: string,
): TestResult | null {
    const file = cacheKey(sessionId, command, lang)
    if (!fs.exists(file)) return null

    try {
        const data: CacheEntry = JSON.parse(fs.readRaw(file))
        const age = (Date.now() - data.timestamp) / 1000
        if (age > ttl) return null
        return data.result
    } catch {
        return null
    }
}

export async function setCachedResult(
    sessionId: string,
    command: string,
    result: TestResult,
    lang?: string,
): Promise<void> {
    const file = cacheKey(sessionId, command, lang)
    try {
        fs.mkdir(cacheDir(sessionId))
        const entry: CacheEntry = { result, timestamp: Date.now() }
        await fs.write(file, JSON.stringify(entry))
    } catch (err) {
        console.error(
            `[rct] Cache write failed: ${err instanceof Error ? err.message : err}`,
        )
    }
}
