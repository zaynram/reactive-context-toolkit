import { exec } from '#lib/tmux'
import { ok, err } from './helpers'
import { z } from 'zod'
import { createTool } from './factory'
export const options = {
    title: 'Tmux Send',
    description: 'Send keys (commands) to a tmux pane',
    inputSchema: z.object({
        target: z.string().describe('Pane target'),
        keys: z.string().describe('Text to send'),
        enter: z
            .boolean()
            .optional()
            .describe('Append Enter key (default: true)'),
    }),
}

export const callback = async function ({
    target,
    keys,
    enter = true,
}: z.infer<typeof options.inputSchema>) {
    // Send literal text with -l (prevents key name interpretation)
    const { exitCode } = await exec(['send-keys', '-t', target, '-l', keys])
    if (exitCode !== 0) return err('tmux send-keys failed')
    // Append Enter key via separate call (without -l)
    if (enter) {
        const { exitCode: enterCode } = await exec([
            'send-keys',
            '-t',
            target,
            'Enter',
        ])
        if (enterCode !== 0) return err('tmux send-keys Enter failed')
    }
    return ok(`Sent keys to ${target}`)
}

export default createTool(options, callback)
