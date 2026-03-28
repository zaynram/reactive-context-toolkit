import { describe, test, expect } from "bun:test"
import {
  evaluateCondition,
  evaluateMatch,
  extractTargetValue,
} from "../src/engine/evaluate"
import type { MatchCondition, Match, MatchTarget } from "../src/config/types"

describe("evaluateCondition", () => {
  test("regex operator matches", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "regex",
      pattern: "src/.*\\.ts$",
    }
    expect(evaluateCondition(cond, "src/config/loader.ts")).toBe(true)
    expect(evaluateCondition(cond, "src/config/loader.js")).toBe(false)
  })

  test("regex is default operator", () => {
    const cond: MatchCondition = {
      target: "file_path",
      pattern: "src/.*\\.ts$",
    }
    expect(evaluateCondition(cond, "src/config/loader.ts")).toBe(true)
  })

  test("contains operator", () => {
    const cond: MatchCondition = {
      target: "command",
      operator: "contains",
      pattern: "rm -rf",
    }
    expect(evaluateCondition(cond, "sudo rm -rf /")).toBe(true)
    expect(evaluateCondition(cond, "ls -la")).toBe(false)
  })

  test("not_contains operator", () => {
    const cond: MatchCondition = {
      target: "command",
      operator: "not_contains",
      pattern: "test",
    }
    expect(evaluateCondition(cond, "bun run build")).toBe(true)
    expect(evaluateCondition(cond, "bun test")).toBe(false)
  })

  test("glob operator", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "glob",
      pattern: "src/**/*.ts",
    }
    expect(evaluateCondition(cond, "src/config/loader.ts")).toBe(true)
    expect(evaluateCondition(cond, "test/loader.test.ts")).toBe(false)
  })

  test("pattern array with {name, path} objects", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "regex",
      pattern: [
        { name: "ts files", path: ".*\\.ts$" },
        { name: "js files", path: ".*\\.js$" },
      ],
    }
    expect(evaluateCondition(cond, "foo.ts")).toBe(true)
    expect(evaluateCondition(cond, "foo.js")).toBe(true)
    expect(evaluateCondition(cond, "foo.py")).toBe(false)
  })

  test("pattern array with strings", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "regex",
      pattern: [".*\\.ts$", ".*\\.js$"],
    }
    expect(evaluateCondition(cond, "foo.ts")).toBe(true)
    expect(evaluateCondition(cond, "foo.py")).toBe(false)
  })

  test("equals operator", () => {
    const cond: MatchCondition = {
      target: "tool_name",
      operator: "equals",
      pattern: "Write",
    }
    expect(evaluateCondition(cond, "Write")).toBe(true)
    expect(evaluateCondition(cond, "write")).toBe(false)
    expect(evaluateCondition(cond, "WriteFile")).toBe(false)
  })

  test("starts_with operator", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "starts_with",
      pattern: "src/",
    }
    expect(evaluateCondition(cond, "src/config/loader.ts")).toBe(true)
    expect(evaluateCondition(cond, "test/loader.test.ts")).toBe(false)
  })

  test("ends_with operator", () => {
    const cond: MatchCondition = {
      target: "file_path",
      operator: "ends_with",
      pattern: ".ts",
    }
    expect(evaluateCondition(cond, "src/loader.ts")).toBe(true)
    expect(evaluateCondition(cond, "src/loader.js")).toBe(false)
  })
})

describe("evaluateMatch", () => {
  test("array of conditions uses AND logic", () => {
    const match: Match = [
      { target: "file_path", operator: "regex", pattern: "src/.*" },
      { target: "file_path", operator: "ends_with", pattern: ".ts" },
    ]
    const payload = { tool_input: { file_path: "src/loader.ts" } }
    expect(evaluateMatch(match, payload)).toBe(true)

    const payload2 = { tool_input: { file_path: "src/loader.js" } }
    expect(evaluateMatch(match, payload2)).toBe(false)
  })

  test("single condition works", () => {
    const match: Match = {
      target: "file_path",
      operator: "contains",
      pattern: "config",
    }
    const payload = { tool_input: { file_path: "src/config/loader.ts" } }
    expect(evaluateMatch(match, payload)).toBe(true)
  })
})

describe("extractTargetValue", () => {
  test("extracts file_path from tool_input", () => {
    const payload = { tool_input: { file_path: "src/config/loader.ts" } }
    expect(extractTargetValue("file_path", payload)).toBe("src/config/loader.ts")
  })

  test("extracts command from tool_input", () => {
    const payload = { tool_input: { command: "bun test" } }
    expect(extractTargetValue("command", payload)).toBe("bun test")
  })

  test("extracts user_prompt from payload (prompt field)", () => {
    const payload = { prompt: "Please fix the bug" }
    expect(extractTargetValue("user_prompt", payload)).toBe("Please fix the bug")
  })

  test("extracts tool_name from payload", () => {
    const payload = { tool_name: "Write", tool_input: {} }
    expect(extractTargetValue("tool_name", payload)).toBe("Write")
  })

  test("extracts content from tool_input", () => {
    const payload = { tool_input: { content: "hello world" } }
    expect(extractTargetValue("content", payload)).toBe("hello world")
  })

  test("extracts new_string from tool_input", () => {
    const payload = { tool_input: { new_string: "replacement" } }
    expect(extractTargetValue("new_string", payload)).toBe("replacement")
  })

  test("extracts error from payload", () => {
    const payload = { error: "Something went wrong" }
    expect(extractTargetValue("error", payload)).toBe("Something went wrong")
  })

  test("returns empty string for missing target", () => {
    const payload = { tool_input: {} }
    expect(extractTargetValue("file_path", payload)).toBe("")
  })
})
