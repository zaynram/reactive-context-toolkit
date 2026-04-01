import { exec } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface ReadParams {
    target: string
    lines?: number
    history?: boolean
}

export async function handleRead(params: ReadParams) {
    const check = await preflight(params.target)
    if (check) return check

    const args = ['capture-pane', '-t', params.target, '-p']
    if (params.history) {
        args.push('-S', '-')
    } else if (params.lines !== undefined) {
        if (!Number.isInteger(params.lines) || params.lines <= 0) {
            return err('lines must be a positive integer')
        }
        args.push('-S', `-${params.lines}`)
    }

    const { stdout, exitCode } = await exec(args)
    if (exitCode !== 0) return err(`tmux capture-pane failed: ${stdout}`)

    return ok(stdout)
}
