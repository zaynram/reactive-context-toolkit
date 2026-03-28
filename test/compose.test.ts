import { describe, it, expect } from "bun:test"
import { composeOutput } from "#engine/compose"
import type { HookEvent } from "#config/types"

describe("composeOutput", () => {
  const event: HookEvent = "PreToolUse"

  it("returns block JSON when blockResult is provided", () => {
    const result = composeOutput({
      event,
      blockResult: { message: "Not allowed" },
      warnMessages: [],
      injectionResults: [],
      metaResult: null,
      langResult: null,
      testResult: null,
    })

    const parsed = JSON.parse(result)
    expect(parsed.decision).toBe("block")
    expect(parsed.reason).toBe("Not allowed")
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse")
  })

  it("returns additionalContext JSON when injections are provided", () => {
    const result = composeOutput({
      event: "SessionStart",
      blockResult: null,
      warnMessages: [],
      injectionResults: ["<file>content</file>", "<file2>more</file2>"],
      metaResult: null,
      langResult: null,
      testResult: null,
    })

    const parsed = JSON.parse(result)
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart")
    expect(parsed.hookSpecificOutput.additionalContext).toContain("<file>content</file>")
    expect(parsed.hookSpecificOutput.additionalContext).toContain("<file2>more</file2>")
  })

  it("combines warn messages and injections", () => {
    const result = composeOutput({
      event,
      blockResult: null,
      warnMessages: ["Warning: be careful", "Warning: check twice"],
      injectionResults: ["<data>value</data>"],
      metaResult: null,
      langResult: null,
      testResult: null,
    })

    const parsed = JSON.parse(result)
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain("Warning: be careful")
    expect(ctx).toContain("Warning: check twice")
    expect(ctx).toContain("<data>value</data>")
  })

  it("returns empty string when nothing to inject", () => {
    const result = composeOutput({
      event,
      blockResult: null,
      warnMessages: [],
      injectionResults: [],
      metaResult: null,
      langResult: null,
      testResult: null,
    })

    expect(result).toBe("")
  })

  it("includes meta, lang, and test results when provided", () => {
    const result = composeOutput({
      event: "SessionStart",
      blockResult: null,
      warnMessages: [],
      injectionResults: [],
      metaResult: "<rct-meta><files/></rct-meta>",
      langResult: "<config>ts stuff</config>",
      testResult: "test: pass",
    })

    const parsed = JSON.parse(result)
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain("<rct-meta><files/></rct-meta>")
    expect(ctx).toContain("<config>ts stuff</config>")
    expect(ctx).toContain("test: pass")
  })
})
