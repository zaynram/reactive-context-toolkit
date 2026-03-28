import { describe, test, expect } from "bun:test"
import { evaluateRules } from "../src/engine/rules"
import type { RuleEntry } from "../src/config/types"

const blockRule: RuleEntry = {
  on: "PreToolUse",
  matcher: "Write|Edit",
  match: { target: "file_path", operator: "regex", pattern: "docs/.*specs?/" },
  action: "block",
  message: "Specs belong in .claude/plans/",
}

const warnRule: RuleEntry = {
  on: "PreToolUse",
  matcher: "Write|Edit",
  match: { target: "file_path", operator: "contains", pattern: "TODO" },
  action: "warn",
  message: "File contains TODO marker",
}

const warnRule2: RuleEntry = {
  on: "PreToolUse",
  match: { target: "command", operator: "contains", pattern: "rm" },
  action: "warn",
  message: "Destructive command detected",
}

describe("evaluateRules", () => {
  test("returns null when no rules match", () => {
    const result = evaluateRules(
      [blockRule],
      "PreToolUse",
      "Write",
      { tool_input: { file_path: "src/index.ts" } },
    )
    expect(result).toBeNull()
  })

  test("returns block for matching block rule", () => {
    const result = evaluateRules(
      [blockRule],
      "PreToolUse",
      "Write",
      { tool_input: { file_path: "docs/specs/api.md" } },
    )
    expect(result).not.toBeNull()
    expect(result!.action).toBe("block")
    expect(result!.messages).toEqual(["Specs belong in .claude/plans/"])
  })

  test("returns warn messages for matching warn rules", () => {
    const result = evaluateRules(
      [warnRule, warnRule2],
      "PreToolUse",
      "Edit",
      { tool_input: { file_path: "TODO.md", command: "rm -rf" } },
    )
    expect(result).not.toBeNull()
    expect(result!.action).toBe("warn")
    expect(result!.messages).toContain("File contains TODO marker")
  })

  test("skips rules with enabled: false", () => {
    const disabled: RuleEntry = { ...blockRule, enabled: false }
    const result = evaluateRules(
      [disabled],
      "PreToolUse",
      "Write",
      { tool_input: { file_path: "docs/specs/api.md" } },
    )
    expect(result).toBeNull()
  })

  test("filters by event name", () => {
    const result = evaluateRules(
      [blockRule],
      "PostToolUse",
      "Write",
      { tool_input: { file_path: "docs/specs/api.md" } },
    )
    expect(result).toBeNull()
  })

  test("filters by matcher (pipe-delimited tool names)", () => {
    const result = evaluateRules(
      [blockRule],
      "PreToolUse",
      "Read",
      { tool_input: { file_path: "docs/specs/api.md" } },
    )
    expect(result).toBeNull()
  })

  test("matches when no matcher specified (any tool)", () => {
    const noMatcher: RuleEntry = {
      on: "PreToolUse",
      match: { target: "file_path", operator: "contains", pattern: "secret" },
      action: "block",
      message: "No secrets!",
    }
    const result = evaluateRules(
      [noMatcher],
      "PreToolUse",
      "Write",
      { tool_input: { file_path: "secret.txt" } },
    )
    expect(result).not.toBeNull()
    expect(result!.action).toBe("block")
  })

  test("block takes priority over warn", () => {
    const result = evaluateRules(
      [warnRule, blockRule],
      "PreToolUse",
      "Edit",
      { tool_input: { file_path: "docs/specs/TODO.md" } },
    )
    expect(result).not.toBeNull()
    expect(result!.action).toBe("block")
    expect(result!.messages).toEqual(["Specs belong in .claude/plans/"])
  })
})
