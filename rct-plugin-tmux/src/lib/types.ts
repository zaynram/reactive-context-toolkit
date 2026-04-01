export interface PaneInfo {
    target: string
    width: number
    height: number
    command: string
    active: boolean
}

export class TmuxNotFoundError extends Error {
    constructor() {
        super('tmux is not installed or not in PATH')
        this.name = 'TmuxNotFoundError'
    }
}

export class InvalidTargetError extends Error {
    constructor(target: string) {
        super(
            `Invalid pane target '${target}'. Use format: session:window.pane`,
        )
        this.name = 'InvalidTargetError'
    }
}

export class NoSessionError extends Error {
    constructor() {
        super(
            'No tmux session found. Start one with: tmux new-session -s <name>',
        )
        this.name = 'NoSessionError'
    }
}
