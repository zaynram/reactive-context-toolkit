import { exec } from '#lib/tmux'
import { ok, err, preflight } from './helpers'
import { z } from 'zod'
import { createTool } from './factory'
export const options = {
    title: 'Tmux Split',
    description: 'Create a new pane by splitting an existing one',
    inputSchema: z.object({
        target: z.string().optional().describe('Pane to split'),
        direction: z
            .enum(['horizontal', 'vertical'])
            .optional()
            .describe('Split direction (default: vertical)'),
        percent: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('Size percentage (default: 50)'),
        command: z.string().optional().describe('Command to run in new pane'),
    }),
}

export const callback = async function ({
    target,
    direction,
    percent,
    command,
}: z.infer<typeof options.inputSchema>) {
    const check = await preflight(target)
    if (check) return check
    const dir = direction === 'horizontal' ? '-h' : '-v'
    const args = ['split-window']
    if (target) args.push('-t', target)
    args.push(dir)
    if (percent !== undefined) {
        const rounded = Math.round(percent)
        if (rounded < 1 || rounded > 100) {
            return err('Invalid percent: must be between 1 and 100')
        }
        args.push('-p', String(rounded))
    }
    args.push('-d', '-P', '-F', '#{session_name}:#{window_index}.#{pane_index}')
    if (command) args.push(command)

    const { stdout, stderr, exitCode } = await exec(args)
    if (exitCode !== 0)
        return err(`tmux split-window failed: ${stderr || stdout}`)
    return ok(stdout.trim())
}

export default createTool(options, callback)
