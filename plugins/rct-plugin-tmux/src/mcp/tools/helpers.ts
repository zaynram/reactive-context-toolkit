import { isAvailable, hasSession, validateTarget } from '#lib/tmux'
import { InvalidTargetError } from '#lib/types'
import { z } from 'zod'

const mcpResult = z.object({
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    isError: z.literal(true).optional(),
})
export type McpResultSchema = typeof mcpResult
export type McpResult = z.infer<McpResultSchema>

type McpResultWrapper = (text: string) => McpResult
export const ok: McpResultWrapper = (text) => ({
    content: [{ type: 'text', text }],
})
export const err: McpResultWrapper = (text) => ({
    isError: true,
    content: [{ type: 'text', text }],
})

export async function preflight(target?: unknown): Promise<McpResult | void> {
    if (!(await isAvailable()))
        return err('tmux is not installed or not in PATH')
    if (!(await hasSession()))
        return err('No tmux session found. Run: tmux new-session -s <name>')
    if (typeof target !== 'string') return
    try {
        validateTarget(target)
    } catch (e) {
        if (e instanceof InvalidTargetError) return err(e.message)
        throw e
    }
    return
}
