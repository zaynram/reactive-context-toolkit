import { composeOutput } from '#engine/compose'
import { parseInput } from '#lib/io'
import type { PluginHookInput } from '#plugin/types'
import { minify } from '#util/general'
import type { SyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'

/** Write a successful hook JSON response to stdout and exit 0. */
export function standard(output: SyncHookJSONOutput): never {
    console.log(minify(JSON.stringify(output)))
    return process.exit(0)
}

/**
 * Read and parse the hook payload from stdin into a typed input. Thin wrapper
 * over {@link parseInput} (the canonical input boundary), retained for the
 * low-level helper surface; the event is taken from the payload itself.
 */
export function dynamic(): Promise<PluginHookInput> {
    return parseInput()
}

/**
 * Block the tool call: write the reason to stderr and exit 2. Per the Claude
 * Code hook contract, exit 2 feeds stderr back to Claude and ignores stdout.
 */
export function block(message: string): never {
    console.error(composeOutput({ blockResult: { message } }))
    return process.exit(2)
}
