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
            `Invalid tmux target '${target}'. Expected format: session:window.pane (e.g., dev:0.1)`,
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
