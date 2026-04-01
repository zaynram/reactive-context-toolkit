import { exec, parseListPanes } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface ListParams {
    session?: string
}

export async function handleList(params: ListParams) {
    const check = await preflight()
    if (check) return check

    const fmt =
        '#{session_name}:#{window_index}.#{pane_index}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_active}'
    const args =
        params.session ?
            ['list-panes', '-t', params.session, '-F', fmt]
        :   ['list-panes', '-a', '-F', fmt]

    const { stdout, stderr, exitCode } = await exec(args)
    if (exitCode !== 0)
        return err(`tmux list-panes failed: ${stderr || stdout}`)

    const panes = parseListPanes(stdout)
    return ok(JSON.stringify(panes, null, 2))
}
