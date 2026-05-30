import { RC } from '#types'
import { minify } from '#util'

type HookHandler = (input: RC.HookInput) => RC.HookJSONOutput | Promise<RC.HookJSONOutput>

/**
 * Create a managed hook handler. Handles stdin parsing, handler invocation,
 * stdout formatting, and exit codes. The recommended way to write custom hooks.
 *
 * @example
 * ```ts
 * import { createHook } from 'reactive-context-toolkit'
 *
 * createHook(async (input) => {
 *     return { hookSpecificOutput: { additionalContext: 'Hello from my hook' } }
 * })
 * ```
 */
export function createHook(handler: HookHandler): void {
    let data = ''
    let settled = false
    const run = async () => {
        if (settled) return
        settled = true
        let input: RC.HookInput
        try {
            input = JSON.parse(data || '{}') as RC.HookInput
        } catch {
            // Parse error — don't block, just exit with no output
            console.error('[rct] Failed to parse hook stdin as JSON')
            process.exit(1)
            return
        }
        try {
            const result = await handler(input)
            const output = minify(JSON.stringify(result))
            if (output) console.log(output)
            process.exit(0)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error(`[rct] Hook handler error: ${message}`)
            console.log(
                minify(JSON.stringify({ decision: 'block', stopReason: message }))
            )
            process.exit(2)
        }
    }

    // No piped payload when stdin is a TTY — run immediately rather than
    // waiting on an 'end' event that will never fire (which would hang).
    if (process.stdin.isTTY) {
        void run()
        return
    }

    process.stdin.on('data', (chunk: Buffer | string) => (data += chunk))
    process.stdin.on('end', () => void run())
    process.stdin.on('error', err => {
        console.log(
            minify(JSON.stringify({ decision: 'block', stopReason: err.message }))
        )
        process.exit(2)
    })
}
