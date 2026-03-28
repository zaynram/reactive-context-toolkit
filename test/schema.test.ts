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

  test("metaFile.injectOn creates injection with colon ref", () => {
    const config: ValidatedConfig = {
      globals: { format: "xml", wrapper: "context", briefByDefault: false },
      files: [
        {
          alias: "docs",
          path: "dev/docs.md",
          metaFiles: [
            { alias: "meta", path: "dev/docs-meta.md", injectOn: "SessionStart" },
          ],
        },
      ],
      injections: [],
    }
    const result = desugarFileInjections(config)
    const injections = result.injections!
    expect(injections.length).toBe(1)
    expect(injections[0].on).toBe("SessionStart")
    expect(injections[0].inject).toEqual(["docs:meta"])
  })

  test("metaFile.injectOn with multiple events", () => {
    const config: ValidatedConfig = {
      globals: { format: "xml", wrapper: "context", briefByDefault: false },
      files: [
        {
          alias: "docs",
          path: "dev/docs.md",
          metaFiles: [
            { alias: "meta", path: "dev/docs-meta.md", injectOn: ["SessionStart", "PreToolUse"] },
          ],
        },
      ],
      injections: [],
    }
    const result = desugarFileInjections(config)
    const injections = result.injections!
    expect(injections.length).toBe(2)
    expect(injections.some((i: InjectionEntry) => i.on === "SessionStart" && i.inject.includes("docs:meta"))).toBe(true)
    expect(injections.some((i: InjectionEntry) => i.on === "PreToolUse" && i.inject.includes("docs:meta"))).toBe(true)
  })

  test("metaFile dedup: explicit injection overrides implicit", () => {
    const config: ValidatedConfig = {
      globals: { format: "xml", wrapper: "context", briefByDefault: false },
      files: [
        {
          alias: "docs",
          path: "dev/docs.md",
          metaFiles: [
            { alias: "meta", path: "dev/docs-meta.md", injectOn: "SessionStart" },
          ],
        },
      ],
      injections: [
        {
          on: "SessionStart",
          inject: ["docs:meta"],
          wrapper: "custom",
        },
      ],
    }
    const result = desugarFileInjections(config)
    const injections = result.injections!
    const sessionMeta = injections.filter(
      (i: InjectionEntry) => i.on === "SessionStart" && i.inject.includes("docs:meta"),
    )
    expect(sessionMeta).toHaveLength(1)
    expect(sessionMeta[0].wrapper).toBe("custom")
  })
})

describe("staleCheck", () => {
  test("applyStaleCheck wraps stale content", () => {
    const { applyStaleCheck } = require("../src/config/schema") as typeof import("../src/config/schema")
    const content = "<scope><date>2025-01-01</date><focus>Old stuff</focus></scope>"
    const staleConfig = { dateTag: "date", wrapTag: "stale-scope" }
    const today = "2026-03-28"
    const result = applyStaleCheck(content, staleConfig, today)
    expect(result).toContain("<stale-scope")
    expect(result).toContain('date="2025-01-01"')
    expect(result).toContain(`today="${today}"`)
    expect(result).toContain(content)
    expect(result).toContain("</stale-scope>")
  })

  test("applyStaleCheck returns content unchanged when not stale", () => {
    const { applyStaleCheck } = require("../src/config/schema") as typeof import("../src/config/schema")
    const content = "<scope><date>2026-03-28</date><focus>Current</focus></scope>"
    const staleConfig = { dateTag: "date", wrapTag: "stale-scope" }
    const today = "2026-03-28"
    const result = applyStaleCheck(content, staleConfig, today)
    // Not stale, so no wrapping
    expect(result).toBe(content)
  })

  test("applyStaleCheck returns content unchanged when no date found", () => {
    const { applyStaleCheck } = require("../src/config/schema") as typeof import("../src/config/schema")
    const content = "<scope><focus>No date</focus></scope>"
    const staleConfig = { dateTag: "date", wrapTag: "stale-scope" }
    const today = "2026-03-28"
    const result = applyStaleCheck(content, staleConfig, today)
    expect(result).toBe(content)
  })
})
