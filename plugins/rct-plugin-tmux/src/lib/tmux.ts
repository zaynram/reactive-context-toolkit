import { type PaneInfo, TmuxNotFoundError, InvalidTargetError } from './types'

const TARGET_RE = /^[a-zA-Z0-9_:./$@%-]+$/

export async function exec(
    args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
        const proc = Bun.spawn(['tmux', ...args], {
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const exitCode = await proc.exited
        return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode }
    } catch (e: unknown) {
        const code = (e as { code?: string })?.code
        if (code === 'ENOENT' || code === 'ERR_CHILD_PROCESS_EXEC_FAILED') {
            throw new TmuxNotFoundError()
        }
        if (
            e instanceof Error
            && (e.message.includes('ENOENT')
                || e.message.includes('not found')
                || e.message.includes('spawn'))
        ) {
            throw new TmuxNotFoundError()
        }
        throw e
    }
}

export async function isAvailable(): Promise<boolean> {
    try {
        const { exitCode } = await exec(['-V'])
        return exitCode === 0
    } catch (e) {
        if (e instanceof TmuxNotFoundError) return false
        return false
    }
}

export async function hasSession(): Promise<boolean> {
    try {
        const { exitCode } = await exec(['list-sessions'])
        return exitCode === 0
    } catch (e) {
        if (e instanceof TmuxNotFoundError) return false
        return false
    }
}

export function parseListPanes(output: string): PaneInfo[] {
    if (!output.trim()) return []
    const panes: PaneInfo[] = []
    for (const line of output.split('\n')) {
        const parts = line.split('\t')
        if (parts.length < 5) continue
        const width = parseInt(parts[1], 10)
        const height = parseInt(parts[2], 10)
        if (Number.isNaN(width) || Number.isNaN(height)) continue
        panes.push({
            target: parts[0],
            width,
            height,
            command: parts[3],
            active: parts[4] === '1',
        })
    }
    return panes
}

export function validateTarget(target: string): void {
    if (!target || !TARGET_RE.test(target)) {
        throw new InvalidTargetError(target)
    }
}

export async function getCurrentSession(): Promise<string | undefined> {
    if (!process.env.TMUX) return undefined
    try {
        const { stdout, exitCode } = await exec([
            'display-message',
            '-p',
            '#{session_name}',
        ])
        if (exitCode !== 0) return undefined
        return stdout.trim() || undefined
    } catch {
        return undefined
    }
}
