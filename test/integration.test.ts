import { describe, test, expect } from 'bun:test'
import { spawnSync } from 'child_process'
import path from 'path'

const INDEX_PATH = path.resolve(__dirname, '../src/cli/index.ts')
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/project')

function runHook(
    event: string,
    stdin?: string,
): { stdout: string; exitCode: number } {
    const result = spawnSync('bun', ['run', INDEX_PATH, 'hook', event], {
        cwd: FIXTURE_DIR,
        env: { ...process.env, CLAUDE_PROJECT_DIR: FIXTURE_DIR },
        input: stdin,
        encoding: 'utf-8',
        timeout: 10000,
    })
    return { stdout: result.stdout?.trim() ?? '', exitCode: result.status ?? 1 }
}

describe('integration: cli subprocess', () => {
    test('SessionStart outputs file content from fixture config', () => {
        const { stdout, exitCode } = runHook('SessionStart')
        expect(exitCode).toBe(0)

        // Should output JSON with additionalContext containing the chores file
        const parsed = JSON.parse(stdout)
        expect(parsed.hookSpecificOutput).toBeDefined()
        expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
        expect(parsed.hookSpecificOutput.additionalContext).toContain('chores')
        expect(parsed.hookSpecificOutput.additionalContext).toContain(
            'Fix tests',
        )
    })

    test('PreToolUse with Write to docs/specs/ triggers block rule (exit code 2)', () => {
        const payload = JSON.stringify({
            tool_name: 'Write',
            tool_input: { file_path: 'docs/specs/api.md', content: 'test' },
        })
        const { stdout, exitCode } = runHook('PreToolUse', payload)
        expect(exitCode).toBe(2)

        const parsed = JSON.parse(stdout)
        expect(parsed.decision).toBe('block')
        expect(parsed.reason).toContain('Specs belong in .claude/plans/')
    })

    test('PostToolUse Read of chores file triggers injection', () => {
        const choresAbsPath = path.join(FIXTURE_DIR, 'dev/chores.xml')
        const payload = JSON.stringify({
            tool_name: 'Read',
            tool_input: { file_path: choresAbsPath },
        })
        const { stdout, exitCode } = runHook('PostToolUse', payload)
        expect(exitCode).toBe(0)

        // The injection should produce output with the chores content wrapped in <reminder>
        const parsed = JSON.parse(stdout)
        expect(parsed.hookSpecificOutput).toBeDefined()
        expect(parsed.hookSpecificOutput.additionalContext).toContain('chores')
        expect(parsed.hookSpecificOutput.additionalContext).toContain(
            'Fix tests',
        )
        expect(parsed.hookSpecificOutput.additionalContext).toContain(
            'reminder',
        )
    })

    test('PreToolUse with no matching rules/injections outputs nothing', () => {
        const payload = JSON.stringify({
            tool_name: 'Bash',
            tool_input: { command: 'ls' },
        })
        const { stdout, exitCode } = runHook('PreToolUse', payload)
        expect(exitCode).toBe(0)
        // No output when nothing matches
        expect(stdout).toBe('')
    })
})
