import { describe, test, expect } from "bun:test"
import { validateConfig, desugarFileInjections, type ValidatedConfig } from "../src/config/schema"
import type { RCTConfig, InjectionEntry } from "../src/config/types"

describe("validateConfig", () => {
  test("returns validated config for valid input", () => {
    const input: RCTConfig = {
      globals: { format: "json", wrapper: "ctx" },
      files: [{ path: "README.md", alias: "readme" }],
      rules: [
        {
          on: "PreToolUse",
          match: { target: "file_path", pattern: "src/.*\\.ts$" },
          action: "block",
          message: "No",
        },
      ],
    }
    const result = validateConfig(input)
    expect(result.globals.format).toBe("json")
    expect(result.globals.wrapper).toBe("ctx")
    expect(result.files).toHaveLength(1)
    expect(result.rules).toHaveLength(1)
  })

  test("throws on invalid regex pattern in rules", () => {
    const input: RCTConfig = {
      rules: [
        {
          on: "PreToolUse",
          match: { target: "file_path", operator: "regex", pattern: "[invalid(" },
          action: "block",
          message: "Bad",
        },
      ],
    }
    expect(() => validateConfig(input)).toThrow(/invalid regex/i)
  })

  test("throws on invalid regex pattern in injections match", () => {
    const input: RCTConfig = {
      injections: [
        {
          on: "PreToolUse",
          match: { target: "file_path", operator: "regex", pattern: "(unclosed" },
          inject: ["foo"],
        },
      ],
    }
    expect(() => validateConfig(input)).toThrow(/invalid regex/i)
  })

  test("populates defaults when globals missing", () => {
    const result = validateConfig({})
    expect(result.globals.format).toBe("xml")
    expect(result.globals.wrapper).toBe("context")
    expect(result.globals.briefByDefault).toBe(false)
  })

  test("populates defaults when globals partial", () => {
    const result = validateConfig({ globals: { format: "json" } })
    expect(result.globals.format).toBe("json")
    expect(result.globals.wrapper).toBe("context")
    expect(result.globals.briefByDefault).toBe(false)
  })
})

describe("desugarFileInjections", () => {
  test("creates injection from file.injectOn", () => {
    const config: ValidatedConfig = {
      globals: { format: "xml", wrapper: "context", briefByDefault: false },
      files: [
        { alias: "chores", path: "dev/chores.xml", injectOn: "SessionStart" },
        { alias: "scope", path: "dev/scope.xml", injectOn: ["PreToolUse", "PostToolUse"] },
      ],
      injections: [],
    }
    const result = desugarFileInjections(config)
    // Should create injections for each event
    expect(result.injections).toBeDefined()
    const injections = result.injections!
    // "chores" on SessionStart, "scope" on PreToolUse, "scope" on PostToolUse
    expect(injections.length).toBe(3)
    expect(injections.some((i: InjectionEntry) => i.on === "SessionStart" && i.inject.includes("chores"))).toBe(true)
    expect(injections.some((i: InjectionEntry) => i.on === "PreToolUse" && i.inject.includes("scope"))).toBe(true)
    expect(injections.some((i: InjectionEntry) => i.on === "PostToolUse" && i.inject.includes("scope"))).toBe(true)
  })

  test("explicit injection wins on dedup", () => {
    const config: ValidatedConfig = {
      globals: { format: "xml", wrapper: "context", briefByDefault: false },
      files: [
        { alias: "chores", path: "dev/chores.xml", injectOn: "SessionStart" },
      ],
      injections: [
        {
          on: "SessionStart",
          inject: ["chores"],
          wrapper: "custom-wrapper",
        },
      ],
    }
    const result = desugarFileInjections(config)
    const injections = result.injections!
    // Only one injection for chores on SessionStart, and it's the explicit one with custom wrapper
    const sessionInjections = injections.filter(
      (i: InjectionEntry) => i.on === "SessionStart" && i.inject.includes("chores"),
    )
    expect(sessionInjections).toHaveLength(1)
    expect(sessionInjections[0].wrapper).toBe("custom-wrapper")
  })
})
