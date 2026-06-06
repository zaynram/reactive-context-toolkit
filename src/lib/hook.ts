import type { HookEvent } from '#config/types'
import { composeOutput } from '#engine/compose'
import { withTimeout } from '#lib/io'
import type { PluginHookInput } from '#plugin/types'
import error from '#util/error'
import { minify } from '#util/general'

const STDIN_TIMEOUT_MS = parseInt(process.env.RCT_STDIN_TIMEOUT_MS ?? '5000')

/** Output object a {@link createHook} handler returns; serialized to stdout on success. */
export interface HookHandlerOutput {
    hookSpecificOutput?: { hookEventName?: HookEvent; additionalContext?: string }
    decision?: 'block' | 'approve'
    reason?: string
    [key: string]: unknown
}

type HookHandler = (
    input: PluginHookInput
) => HookHandlerOutput | Promise<HookHandlerOutput>

/**
 * Create a managed hook handler. Handles stdin parsing, handler invocation,
 * stdout formatting, and exit codes — the recommended way to write custom hooks.
 *
 * Composes the same `withTimeout` primitive the CLI pipeline uses (so a slow or
 * never-closing pipe can't wedge the process) while keeping a stricter input
 * policy than `parseInput`: an empty stdin runs the handler with an empty stub,
 * but non-empty-yet-malformed JSON bails non-blocking (exit 1) rather than
 * feeding the handler garbage. On a handler throw, the reason is written to
 * stderr and the process exits 2 — matching the Claude Code block contract
 * (stdout/JSON is ignored on exit 2; stderr is fed back to Claude).
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
    void (async () => {
        // A TTY means nothing was piped in; don't await an EOF that never comes.
        const raw = process.stdin.isTTY
            ? ''
            : ((await withTimeout(
                  () => Bun.stdin.text(),
                  STDIN_TIMEOUT_MS,
                  'Bun.stdin.text'
              )) ?? '')

        // Empty stdin → empty stub; non-empty-but-malformed → bail non-blocking.
        let input: PluginHookInput
        if (raw.trim() === '') input = {} as PluginHookInput
        else
            try {
                input = JSON.parse(raw) as PluginHookInput
            } catch {
                error.write('Failed to parse hook stdin as JSON')
                return process.exit(1)
            }

        try {
            const output = minify(JSON.stringify(await handler(input)))
            if (output) await Bun.stdout.write(output)
            return process.exit(0)
        } catch (err) {
            const message = error.text(err) || 'Unknown error'
            // Exit 2: Claude reads stderr and ignores stdout/JSON.
            await Bun.stderr.write(
                composeOutput({
                    blockResult: { message: `Hook handler error: ${message}` },
                })
            )
            return process.exit(2)
        }
    })()
}
