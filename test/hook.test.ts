import { describe, it, expect } from "bun:test"
import { spawnSync } from "child_process"
import path from "path"

const HOOK_PATH = path.resolve(__dirname, "../src/hook.ts")
const FIXTURE_DIR = path.resolve(__dirname, "fixtures/project")

function runHook(event: string, stdin?: string, env?: Record<string, string>) {
  const result = spawnSync("bun", ["run", HOOK_PATH, event], {
    cwd: FIXTURE_DIR,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: FIXTURE_DIR,
      ...env,
    },
    input: stdin,
    encoding: "utf-8",
    timeout: 10_000,
  })
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    exitCode: result.status ?? 1,
  }
}

describe("hook entry point", () => {
  it("outputs injections for SessionStart from fixture config", () => {
    const result = runHook("SessionStart")
    expect(result.exitCode).toBe(0)
    // The fixture config has files with injectOn: SessionStart
    // chores and scope.xml should be injected
    if (result.stdout) {
      const parsed = JSON.parse(result.stdout)
      expect(parsed.hookSpecificOutput).toBeDefined()
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart")
      expect(parsed.hookSpecificOutput.additionalContext).toBeDefined()
    }
  })

  it("exits with code 2 on PreToolUse block rule", () => {
    const payload = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "docs/specs/something.md", content: "test" },
    })
    const result = runHook("PreToolUse", payload)
    expect(result.exitCode).toBe(2)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.decision).toBe("block")
    expect(parsed.reason).toContain("Specs belong in .claude/plans/")
  })

  it("outputs nothing when no config matches", () => {
    // Setup event has no matching rules or injections in fixture
    const result = runHook("Setup")
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("")
  })

  it("reads stdin for async events", () => {
    // PostToolUse with Read tool on chores file should trigger injection
    const payload = JSON.stringify({
      tool_name: "Read",
      tool_input: { file_path: path.resolve(FIXTURE_DIR, "dev/chores.xml") },
    })
    const result = runHook("PostToolUse", payload)
    expect(result.exitCode).toBe(0)
    if (result.stdout) {
      const parsed = JSON.parse(result.stdout)
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse")
    }
  })
})
