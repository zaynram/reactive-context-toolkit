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
    } else {
        const lines = params.lines ?? 50
        args.push('-S', `-${lines}`)
    }

    const { stdout, exitCode } = await exec(args)
    if (exitCode !== 0) return err(`tmux capture-pane failed: ${stdout}`)

    return ok(stdout)
}
