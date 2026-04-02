import { exec } from '#lib/tmux'
import { ok, err, preflight } from './helpers'
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
    const check = await preflight(target)
    if (check) return check
    // Send literal text with -l (prevents key name interpretation)
    const { stderr, exitCode } = await exec(['send-keys', '-t', target, '-l', keys])
    if (exitCode !== 0) return err(`tmux send-keys failed: ${stderr}`)
    // Append Enter key via separate call (without -l)
    if (enter) {
        const { stderr: enterStderr, exitCode: enterCode } = await exec([
            'send-keys',
            '-t',
            target,
            'Enter',
        ])
        if (enterCode !== 0) return err(`tmux send-keys Enter failed: ${enterStderr}`)
    }
    return ok(`Sent keys to ${target}`)
}

export default createTool(options, callback)
