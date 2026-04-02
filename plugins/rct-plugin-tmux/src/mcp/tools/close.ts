import { exec, parseListPanes } from '#lib/tmux'
import { createTool } from './factory'
import { ok, err } from './helpers'
import { z } from 'zod'

export const options = {
    title: 'Tmux Close',
    description: 'Close a tmux pane (refuses to close last pane in its window)',
    inputSchema: z.object({ target: z.string().describe('Pane to close') }),
}

export const callback = async function ({
    target,
}: z.infer<typeof options.inputSchema>) {
    // List panes in the window containing the target pane
    const { stdout, stderr, exitCode } = await exec([
        'list-panes',
        '-t',
        target,
        '-F',
        '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}',
    ])
    if (exitCode !== 0) return err(`Failed to list panes: ${stderr || stdout}`)
    const panes = parseListPanes(stdout)
    if (panes.length <= 1) {
        return err(
            'Cannot close the last pane in this window. Close the session instead.',
        )
    }
    const { exitCode: killCode } = await exec(['kill-pane', '-t', target])
    if (killCode !== 0) return err('tmux kill-pane failed')

    return ok(`Closed pane ${target}`)
}

export default createTool(options, callback)
