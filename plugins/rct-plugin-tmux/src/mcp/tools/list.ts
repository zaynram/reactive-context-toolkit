import { exec, parseListPanes } from '#lib/tmux'
import { ok, err, preflight } from './helpers'
import { z } from 'zod'
import { createTool } from './factory'

export const options = {
    title: 'Tmux List',
    description:
        'List all panes in the current or specified session with metadata',
    inputSchema: z.object({
        session: z.string().optional().describe('Session name filter'),
    }),
}

export const callback = async function ({
    session,
}: z.infer<typeof options.inputSchema>) {
    const check = await preflight()
    if (check) return check
    const fmt =
        '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}'
    const args =
        session ?
            ['list-panes', '-t', session, '-F', fmt]
        :   ['list-panes', '-a', '-F', fmt]
    const { stdout, stderr, exitCode } = await exec(args)
    if (exitCode !== 0)
        return err(`tmux list-panes failed: ${stderr || stdout}`)
    const panes = parseListPanes(stdout)
    return ok(JSON.stringify(panes, null, 2))
}

export default createTool(options, callback)
