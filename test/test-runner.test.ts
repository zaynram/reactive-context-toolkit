import { describe, expect, test } from "bun:test"
import {
    resolveTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
} from "#test/runner"
import type { RCTConfig, TestResult } from "#test/runner"

describe("resolveTestCommand", () => {
    test("returns string for string config", () => {
        const config: RCTConfig = { test: "bun test --coverage" }
        expect(resolveTestCommand(config)).toBe("bun test --coverage")
    })

    test('resolves "bun test" from lang.typescript with bun tool having scripts:true', () => {
        const config: RCTConfig = {
            test: true,
            lang: {
                typescript: {
                    tools: [{ name: "bun", scripts: true }],
                },
            },
        }
        expect(resolveTestCommand(config)).toBe("bun test")
    })

    test("resolves pixi run test for pixi tool", () => {
        const config: RCTConfig = {
            test: true,
            lang: {
                python: {
                    tools: [{ name: "pixi", tasks: true }],
                },
            },
        }
        expect(resolveTestCommand(config)).toBe("pixi run test")
    })

    test("resolves cargo test for cargo tool", () => {
        const config: RCTConfig = {
            test: true,
            lang: {
                rust: {
                    tools: [{ name: "cargo" }],
                },
            },
        }
        expect(resolveTestCommand(config)).toBe("cargo test")
    })

    test("returns null when no test configured", () => {
        const config: RCTConfig = {}
        expect(resolveTestCommand(config)).toBeNull()
    })

    test("returns null when test is false", () => {
        const config: RCTConfig = { test: false }
        expect(resolveTestCommand(config)).toBeNull()
    })

    test("returns command from TestConfig object", () => {
        const config: RCTConfig = { test: { command: "pytest -x" } }
        expect(resolveTestCommand(config)).toBe("pytest -x")
    })

    test("auto-detects when TestConfig.command is true", () => {
        const config: RCTConfig = {
            test: { command: true },
            lang: {
                typescript: {
                    tools: [{ name: "bun", scripts: true }],
                },
            },
        }
        expect(resolveTestCommand(config)).toBe("bun test")
    })
})

describe("runTest", () => {
    test("returns pass for successful command", () => {
        const result = runTest("true", "/tmp")
        expect(result.status).toBe("pass")
        expect(result.exitCode).toBe(0)
    })

    test("returns fail for failing command", () => {
        const result = runTest("false", "/tmp")
        expect(result.status).toBe("fail")
        expect(result.exitCode).not.toBe(0)
    })

    test("returns fail for nonexistent command", () => {
        const result = runTest("nonexistent_command_xyz_123", "/tmp")
        expect(result.status).toBe("fail")
        expect(result.exitCode).not.toBe(0)
    })
})

describe("formatTestResult", () => {
    test("uses brief template", () => {
        const result: TestResult = {
            status: "pass",
            exitCode: 0,
            output: "all good",
        }
        const formatted = formatTestResult(result, "Result: {status} (code {exitCode})")
        expect(formatted).toBe("Result: pass (code 0)")
    })

    test("with default format for pass", () => {
        const result: TestResult = {
            status: "pass",
            exitCode: 0,
            output: "",
        }
        expect(formatTestResult(result)).toBe("test: pass")
    })

    test("with default format for fail", () => {
        const result: TestResult = {
            status: "fail",
            exitCode: 1,
            output: "error",
        }
        expect(formatTestResult(result)).toBe("test: fail (exit 1)")
    })
})

describe("cache", () => {
    test("returns null for uncached result", () => {
        const result = getCachedResult("session-xyz-999", "bun test", 300)
        expect(result).toBeNull()
    })

    test("stores and retrieves cached result", () => {
        const testResult: TestResult = {
            status: "pass",
            exitCode: 0,
            output: "ok",
        }
        const sessionId = `test-cache-${Date.now()}`
        setCachedResult(sessionId, "bun test", testResult)
        const cached = getCachedResult(sessionId, "bun test", 300)
        expect(cached).not.toBeNull()
        expect(cached!.status).toBe("pass")
        expect(cached!.exitCode).toBe(0)
    })
})
