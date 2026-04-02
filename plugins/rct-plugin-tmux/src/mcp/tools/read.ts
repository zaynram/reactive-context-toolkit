import { exec } from '#lib/tmux'
import { createTool } from './factory'
import { ok, err, preflight } from './helpers'
import { z } from 'zod'

export const options = {
    title: 'Tmux Read',
    description: 'Capture the visual buffer from a tmux pane',
    inputSchema: z.object({
        target: z.string().describe('Pane target (e.g., session:0.1)'),
        lines: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('Number of lines to capture (default: 50)'),
        history: z
            .boolean()
            .optional()
            .describe('Include full scrollback history'),
    }),
}

export const callback = async function ({
    target,
    lines = 50,
    history,
}: z.infer<typeof options.inputSchema>) {
    const check = await preflight(target)
    if (check) return check
    const args = ['capture-pane', '-t', target, '-p']
    if (history) {
        args.push('-S', '-')
    } else {
        if (!Number.isInteger(lines) || lines <= 0) {
            return err('lines must be a positive integer')
        }
        args.push('-S', `-${lines}`)
    }

    const { stdout, stderr, exitCode } = await exec(args)
    if (exitCode !== 0)
        return err(`tmux capture-pane failed: ${stderr || stdout}`)

    return ok(stdout)
}

export default createTool(options, callback)
