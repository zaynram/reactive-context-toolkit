import { exec, parseListPanes } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface CloseParams {
    target: string
}

export async function handleClose(params: CloseParams) {
    const check = await preflight(params.target)
    if (check) return check

    // List panes in the window containing the target pane
    const { stdout, stderr, exitCode } = await exec([
        'list-panes',
        '-t',
        params.target,
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

    const { exitCode: killCode } = await exec([
        'kill-pane',
        '-t',
        params.target,
    ])
    if (killCode !== 0) return err('tmux kill-pane failed')

    return ok(`Closed pane ${params.target}`)
}
