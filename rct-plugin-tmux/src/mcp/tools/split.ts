import { exec } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface SplitParams {
    target?: string
    direction?: 'horizontal' | 'vertical'
    percent?: number
    command?: string
}

export async function handleSplit(params: SplitParams) {
    const check = await preflight(params.target)
    if (check) return check

    const dir = params.direction === 'horizontal' ? '-h' : '-v'
    const args = ['split-window']

    if (params.target) args.push('-t', params.target)
    args.push(dir)
    if (params.percent) args.push('-p', String(params.percent))
    args.push('-d', '-P', '-F', '#{session_name}:#{window_index}.#{pane_index}')
    if (params.command) args.push(params.command)

    const { stdout, exitCode } = await exec(args)
    if (exitCode !== 0) return err(`tmux split-window failed: ${stdout}`)

    return ok(stdout.trim())
}
