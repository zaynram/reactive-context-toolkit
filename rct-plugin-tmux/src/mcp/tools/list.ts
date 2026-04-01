import { exec, parseListPanes } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface ListParams {
    session?: string
}

export async function handleList(params: ListParams) {
    const check = await preflight()
    if (check) return check

    const args = [
        'list-panes',
        '-a',
        '-F',
        '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}',
    ]
    if (params.session) {
        args.push('-t', params.session)
    }

    const { stdout, exitCode } = await exec(args)
    if (exitCode !== 0) return err(`tmux list-panes failed: ${stdout}`)

    const panes = parseListPanes(stdout)
    return ok(JSON.stringify(panes, null, 2))
}
