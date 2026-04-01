import { exec, parseListPanes } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface CloseParams {
    target: string
}

export async function handleClose(params: CloseParams) {
    const check = await preflight(params.target)
    if (check) return check

    // Extract session from target (e.g., "dev:0.1" -> "dev")
    const session = params.target.split(':')[0]

    // Check pane count in session
    const { stdout, exitCode } = await exec([
        'list-panes',
        '-t',
        session,
        '-F',
        '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}',
    ])
    if (exitCode !== 0) return err(`Failed to list panes: ${stdout}`)

    const panes = parseListPanes(stdout)
    if (panes.length <= 1) {
        return err(
            `Cannot close the last pane in session '${session}'. Close the session instead.`,
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
