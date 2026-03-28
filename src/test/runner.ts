import { execSync } from "child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import type {
    RCTConfig,
    TestConfig,
    LangEntry,
    LangTool,
} from "#config/types"

export type { RCTConfig }

export interface TestResult {
    status: "pass" | "fail"
    exitCode: number
    output: string
}

const TOOL_TEST_COMMANDS: Record<string, string> = {
    bun: "bun test",
    npm: "npm test",
    pnpm: "pnpm test",
    pixi: "pixi run test",
    uv: "uv run pytest",
    pip: "pytest",
    pipx: "pytest",
    cargo: "cargo test",
    "cargo-binstall": "cargo test",
    rustup: "cargo test",
}

function findFirstToolCommand(config: RCTConfig): string | null {
    if (!config.lang) return null

    const langEntries: (LangEntry | undefined)[] = [
        config.lang.typescript,
        config.lang.javascript,
        config.lang.python,
        config.lang.rust,
    ]

    for (const entry of langEntries) {
        if (!entry?.tools) continue
        for (const tool of entry.tools) {
            const cmd = TOOL_TEST_COMMANDS[tool.name]
            if (cmd) return cmd
        }
    }

    return null
}

export function resolveTestCommand(config: RCTConfig): string | null {
    if (!config.test) return null

    // String shorthand
    if (typeof config.test === "string") return config.test

    // Boolean true => auto-detect
    if (config.test === true) return findFirstToolCommand(config)

    // TestConfig object
    const testConfig = config.test as TestConfig
    if (typeof testConfig.command === "string") return testConfig.command
    if (testConfig.command === true) return findFirstToolCommand(config)

    return null
}

export function runTest(command: string, rootDir: string): TestResult {
    try {
        const output = execSync(command, {
            encoding: "utf-8",
            cwd: rootDir,
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 120_000,
        })
        return { status: "pass", exitCode: 0, output: output.trim() }
    } catch (err: any) {
        const exitCode = err?.status ?? 1
        const output = (err?.stdout ?? "") + (err?.stderr ?? "")
        return { status: "fail", exitCode, output: output.trim() }
    }
}

export function formatTestResult(result: TestResult, brief?: string): string {
    if (brief) {
        return brief
            .replace(/\{status\}/g, result.status)
            .replace(/\{exitCode\}/g, String(result.exitCode))
            .replace(/\{output\}/g, result.output)
    }
    if (result.status === "pass") return "test: pass"
    return `test: fail (exit ${result.exitCode})`
}

// -- Cache --

const CACHE_DIR = "/tmp/rct-cache"

function cacheKey(sessionId: string, command: string): string {
    // Simple hash-like key from session + command
    const key = `${sessionId}_${command}`.replace(/[^a-zA-Z0-9_-]/g, "_")
    return path.join(CACHE_DIR, `${key}.json`)
}

interface CacheEntry {
    result: TestResult
    timestamp: number
}

export function getCachedResult(
    sessionId: string,
    command: string,
    ttl: number,
): TestResult | null {
    const file = cacheKey(sessionId, command)
    if (!existsSync(file)) return null

    try {
        const data: CacheEntry = JSON.parse(readFileSync(file, "utf-8"))
        const age = (Date.now() - data.timestamp) / 1000
        if (age > ttl) return null
        return data.result
    } catch {
        return null
    }
}

export function setCachedResult(
    sessionId: string,
    command: string,
    result: TestResult,
): void {
    const file = cacheKey(sessionId, command)
    try {
        if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
        const entry: CacheEntry = { result, timestamp: Date.now() }
        writeFileSync(file, JSON.stringify(entry), "utf-8")
    } catch {
        // Silently fail on cache write errors
    }
}
