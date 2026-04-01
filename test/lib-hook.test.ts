import { describe, it, expect, test } from 'bun:test'
import { createHook } from '../src/lib/hook'
import path from 'path'

describe('createHook()', () => {
    it('is exported as a function', () => {
        expect(typeof createHook).toBe('function')
    })

    // Subprocess tests for full lifecycle
    const runHook = async (
        handlerCode: string,
        stdin = '{}',
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        const projectRoot = path.resolve(import.meta.dir, '..')
        const script = `
            import { createHook } from '#lib/hook'
            createHook(${handlerCode})
        `
        const tmpFile = path.join(
            projectRoot,
            `_tmp_hook_test_${Date.now()}.ts`,
        )
        await Bun.write(tmpFile, script)
        try {
            const proc = Bun.spawn(['bun', 'run', tmpFile], {
                stdin: new Response(stdin).body!,
                stdout: 'pipe',
                stderr: 'pipe',
            })
            const stdout = await new Response(proc.stdout).text()
            const stderr = await new Response(proc.stderr).text()
            const exitCode = await proc.exited
            return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
        } finally {
            try {
                const { unlinkSync } = await import('fs')
                unlinkSync(tmpFile)
            } catch {}
        }
    }

    test('happy path: handler result written to stdout, exit 0', async () => {
        const result = await runHook(
            `async (input) => ({ hookSpecificOutput: { additionalContext: 'hello' } })`,
            '{"tool_name":"Read"}',
        )
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('additionalContext')
        expect(result.stdout).toContain('hello')
    })

    test('handler error: outputs block decision, exit 2', async () => {
        const result = await runHook(
            `async () => { throw new Error('handler broke') }`,
        )
        expect(result.exitCode).toBe(2)
        expect(result.stdout).toContain('block')
        expect(result.stdout).toContain('handler broke')
        expect(result.stderr).toContain('Hook handler error')
    })

    test('invalid JSON stdin: exits 1 without blocking', async () => {
        const result = await runHook(
            `async () => ({ hookSpecificOutput: {} })`,
            'not json at all',
        )
        expect(result.exitCode).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('Failed to parse')
    })
})
