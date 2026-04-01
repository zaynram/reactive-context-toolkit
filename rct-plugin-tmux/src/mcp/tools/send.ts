import { exec } from '../../lib/tmux'
import { ok, err, preflight } from './helpers'

interface SendParams {
    target: string
    keys: string
    enter?: boolean
}

export async function handleSend(params: SendParams) {
    const check = await preflight(params.target)
    if (check) return check

    // Send literal text with -l (prevents key name interpretation)
    const { exitCode } = await exec([
        'send-keys',
        '-t',
        params.target,
        '-l',
        params.keys,
    ])
    if (exitCode !== 0) return err('tmux send-keys failed')

    // Append Enter key via separate call (without -l)
    const enter = params.enter ?? true
    if (enter) {
        const { exitCode: enterCode } = await exec([
            'send-keys',
            '-t',
            params.target,
            'Enter',
        ])
        if (enterCode !== 0) return err('tmux send-keys Enter failed')
    }

    return ok(`Sent keys to ${params.target}`)
}
