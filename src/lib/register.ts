import { minify } from '#util'
import { SyncHookJSONOutput, AsyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'

export function standard(output: SyncHookJSONOutput): never {
    console.log(minify(JSON.stringify(output)))
    return process.exit(0)
}

function isError(e: unknown): e is Error {
    return (
        e !== null &&
        typeof e === 'object' &&
        'message' in e &&
        typeof e.message === 'string'
    )
}

export async function dynamic(): Promise<AsyncHookJSONOutput> {
    return new Promise<AsyncHookJSONOutput>(resolve => {
        let data = ''
        const parse = () => {
            try {
                resolve({ ...JSON.parse(data || '{}'), inject: standard })
            } catch (e: unknown) {
                block({
                    stopReason: isError(e) ? e.message : 'An unknown error occurred.',
                })
            }
        }
        // A TTY means nothing was piped in; 'end' would never fire and hang.
        if (process.stdin.isTTY) return parse()
        process.stdin.on('data', chunk => (data += chunk))
        process.stdin.on('end', parse)
        process.stdin.on('error', ({ message }) => block({ stopReason: message }))
    })
}

export function block(
    output: Omit<SyncHookJSONOutput, 'decision' | 'hookSpecificOutput'>
): never {
    console.log(minify(JSON.stringify({ ...output, decision: 'block' })))
    return process.exit(2)
}
