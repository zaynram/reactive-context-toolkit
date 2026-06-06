import type { HookEvent } from '#config/types'
import type { PluginHookInput } from '#plugin/types'
import error from '#util/error'
import timers from 'node:timers/promises'

const STDIN_TIMEOUT_MS = parseInt(process.env.RCT_STDIN_TIMEOUT_MS ?? '5000')
const START_TIMEOUT_MS = parseInt(
    process.env.RCT_START_TIMEOUT_MS ?? `${STDIN_TIMEOUT_MS / 2}`
)

/**
 * Run `fn` with a hard upper bound. Resolves with the value on success, or
 * resolves with `void` on either a thrown error or a timeout — never rejects
 * for those two cases, so a slow/throwing callback can never wedge the caller.
 *
 * This is the shared timeout primitive composed by both `parseInput` (CLI) and
 * `createHook` (library): they layer different input policies on top of the
 * same wedge-proof read.
 */
export function withTimeout<T>(
    fn: () => T | Promise<T>,
    ms: number,
    label: string
): Promise<T | void> {
    const { promise, resolve, reject } = Promise.withResolvers<T | void>()
    const controller = new AbortController()
    Promise.resolve()
        .then(fn)
        .then(resolve)
        .catch(err => {
            error.write(`${label} completed with errors`, { inner: err })
            resolve()
        })
        .finally(() => controller.abort())
    void timers.setTimeout(ms, null, { signal: controller.signal }).then(
        () => {
            error.write(`${label} timed out after ${ms}ms`)
            resolve()
        },
        err => {
            if (error.isinstance(err, 'AbortError')) return
            error.write(`unknown timeout error`, { level: 'debug', inner: err })
            reject(err)
        }
    )
    return promise
}

/**
 * Read and parse the hook payload from stdin for async events.
 *
 * Since `Bun.stdin.json()` only resolves once stdin reaches EOF, all events are
 * handled asynchronously and we must guard against wedge cases: if the caller
 * keeps the pipe open (or the command runs interactively with stdin on a TTY)
 * the read may never complete.
 *
 * We work around this by returning an event-name-only stub on `process.stdin.isTTY`
 * and by enforcing strict timeouts. SessionStart gets its own (shorter) timeout
 * so startup latency stays low in the worst case, per Anthropic's recommendation.
 *
 * An empty/closed/timed-out stdin yields an event-name-only stub rather than
 * crashing downstream — the resilient policy appropriate for the managed CLI
 * pipeline. (Custom hooks that want strict parse-error handling read stdin
 * directly; see `createHook`.)
 */
export async function parseInput(event?: HookEvent): Promise<PluginHookInput> {
    // Interactive TTY means there is no piped payload; fall back to event name only.
    if (process.stdin.isTTY) return { hook_event_name: event } as PluginHookInput
    // Separate timeout for SessionStart to ensure quicker startup on timeout.
    const timeout = event === 'SessionStart' ? START_TIMEOUT_MS : STDIN_TIMEOUT_MS
    const parsed = await withTimeout(() => Bun.stdin.json(), timeout, 'Bun.stdin.json')
    return (parsed ?? { hook_event_name: event }) as PluginHookInput
}
