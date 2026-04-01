import { isAvailable, hasSession, validateTarget } from '../../lib/tmux'
import { InvalidTargetError } from '../../lib/types'

type McpResult = {
    content: { type: 'text'; text: string }[]
    isError?: true
}

export function ok(text: string): McpResult {
    return { content: [{ type: 'text', text }] }
}

export function err(text: string): McpResult {
    return { isError: true, content: [{ type: 'text', text }] }
}

export async function preflight(target?: string): Promise<McpResult | null> {
    if (!(await isAvailable())) {
        return err('tmux is not installed or not in PATH')
    }
    if (!(await hasSession())) {
        return err(
            'No tmux session found. Start one with: tmux new-session -s <name>',
        )
    }
    if (target !== undefined) {
        try {
            validateTarget(target)
        } catch (e) {
            if (e instanceof InvalidTargetError) return err(e.message)
            throw e
        }
    }
    return null
}
