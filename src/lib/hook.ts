import { RC } from '#types'
import { minify } from '#util'

type HookHandler = (
    input: RC.HookInput,
) => RC.HookJSONOutput | Promise<RC.HookJSONOutput>

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
    process.stdin.on('data', (chunk: Buffer | string) => (data += chunk))
    process.stdin.on('end', async () => {
        try {
            const input = JSON.parse(data || '{}') as RC.HookInput
            const result = await handler(input)
            const output = minify(JSON.stringify(result))
            if (output) console.log(output)
            process.exit(0)
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Unknown error'
            console.log(
                minify(
                    JSON.stringify({ decision: 'block', stopReason: message }),
                ),
            )
            process.exit(2)
        }
    })
    process.stdin.on('error', (err) => {
        console.log(
            minify(
                JSON.stringify({
                    decision: 'block',
                    stopReason: err.message,
                }),
            ),
        )
        process.exit(2)
    })
}
