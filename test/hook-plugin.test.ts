import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'child_process'
import path from 'path'

const INDEX_PATH = path.resolve(__dirname, '../src/cli/index.ts')
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/plugin-project')
const THROWING_FIXTURE_DIR = path.resolve(
    __dirname,
    'fixtures/plugin-project-throwing',
)

function runHook(
    event: string,
    fixtureDir: string,
    stdin?: string,
    env?: Record<string, string>,
) {
    const result = spawnSync('bun', ['run', INDEX_PATH, 'hook', event], {
        cwd: fixtureDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: fixtureDir, ...env },
        input: stdin,
        encoding: 'utf-8',
        timeout: 15_000,
    })
    return {
        stdout: result.stdout?.trim() ?? '',
        stderr: result.stderr?.trim() ?? '',
        exitCode: result.status ?? 1,
    }
}

describe('hook pipeline — plugin trigger integration', () => {
    it('plugin trigger blocks with exit code 2 when tool matches', () => {
        const payload = JSON.stringify({
            tool_name: 'BlockedTool',
            tool_input: {},
        })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(2)
        const parsed = JSON.parse(result.stdout)
        expect(parsed.decision).toBe('block')
        expect(parsed.reason).toContain('BlockedTool is not allowed by plugin')
    })

    it('plugin trigger does not block when tool does not match', () => {
        const payload = JSON.stringify({ tool_name: 'Read', tool_input: {} })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
    })

    it('plugin trigger warns without blocking when tool matches warn condition', () => {
        const payload = JSON.stringify({
            tool_name: 'WarnTool',
            tool_input: {},
        })
        const result = runHook('PreToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
        // Warn message is included in additionalContext (not a block response)
        const parsed = JSON.parse(result.stdout)
        const ctx = parsed.hookSpecificOutput?.additionalContext ?? ''
        expect(ctx).toContain('WarnTool requires caution')
    })
})

describe('hook pipeline — plugin context integration', () => {
    it('plugin context injects dynamic output on SessionStart', () => {
        const result = runHook('SessionStart', FIXTURE_DIR)
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBeTruthy()
        const parsed = JSON.parse(result.stdout)
        expect(parsed.hookSpecificOutput).toBeDefined()
        expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
        const ctx = parsed.hookSpecificOutput.additionalContext ?? ''
        expect(ctx).toContain('tmux layout data')
    })

    it('plugin context does not inject on non-matching events', () => {
        const payload = JSON.stringify({ tool_name: 'Read', tool_input: {} })
        const result = runHook('PostToolUse', FIXTURE_DIR, payload)
        expect(result.exitCode).toBe(0)
        // context-plugin only returns content on SessionStart, so no tmux content
        if (result.stdout) {
            const parsed = JSON.parse(result.stdout)
            const ctx = parsed.hookSpecificOutput?.additionalContext ?? ''
            expect(ctx).not.toContain('tmux layout data')
        }
    })
})

describe('hook pipeline — plugin error isolation', () => {
    it('throwing context does not break the pipeline', () => {
        // Use a fixture that includes the throwing-context plugin
        const result = runHook('SessionStart', THROWING_FIXTURE_DIR)
        // Should still exit 0 despite the throwing plugin
        expect(result.exitCode).toBe(0)
    })
})
