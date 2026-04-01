import { describe, expect, it, mock, beforeEach } from 'bun:test'
import { parseListPanes, validateTarget } from '../src/lib/tmux'

// We mock the tmux wrapper so tool tests are pure unit tests
const mockExec =
    mock<(args: string[]) => Promise<{ stdout: string; exitCode: number }>>()
const mockIsAvailable = mock<() => Promise<boolean>>()
const mockHasSession = mock<() => Promise<boolean>>()

// Mock the tmux module before importing tools
mock.module('../src/lib/tmux', () => ({
    exec: mockExec,
    isAvailable: mockIsAvailable,
    hasSession: mockHasSession,
    parseListPanes,
    validateTarget,
    getCurrentSession: async () => undefined,
}))

const { handleList } = await import('../src/mcp/tools/list')
const { handleRead } = await import('../src/mcp/tools/read')
const { handleSend } = await import('../src/mcp/tools/send')
const { handleSplit } = await import('../src/mcp/tools/split')
const { handleClose } = await import('../src/mcp/tools/close')

function setupMocks(available = true, session = true) {
    mockIsAvailable.mockResolvedValue(available)
    mockHasSession.mockResolvedValue(session)
}

function mcpError(result: unknown): string {
    const r = result as { isError: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    return r.content[0].text
}

function mcpText(result: unknown): string {
    const r = result as { content: { text: string }[] }
    expect(r).not.toHaveProperty('isError')
    return r.content[0].text
}

beforeEach(() => {
    mockExec.mockReset()
    mockIsAvailable.mockReset()
    mockHasSession.mockReset()
})

// ─── tmux_list ───

describe('tmux_list', () => {
    it('returns pane info on success', async () => {
        setupMocks()
        mockExec.mockResolvedValue({
            stdout: 'dev:0.0\t100\t30\tbash\t1\ndev:0.1\t100\t30\tnode\t0',
            exitCode: 0,
        })
        const result = await handleList({})
        const text = mcpText(result)
        expect(text).toContain('dev:0.0')
        expect(text).toContain('dev:0.1')
    })

    it('filters by session', async () => {
        setupMocks()
        mockExec.mockResolvedValue({
            stdout: 'work:0.0\t80\t24\tvim\t1',
            exitCode: 0,
        })
        const result = await handleList({ session: 'work' })
        expect(mcpText(result)).toContain('work:0.0')
        // Verify -t flag was passed
        expect(mockExec.mock.calls[0][0]).toContain('-t')
        expect(mockExec.mock.calls[0][0]).toContain('work')
    })

    it('returns error when tmux not installed', async () => {
        setupMocks(false)
        const result = await handleList({})
        expect(mcpError(result)).toContain('not installed')
    })

    it('returns error when no session', async () => {
        setupMocks(true, false)
        const result = await handleList({})
        expect(mcpError(result)).toContain('No tmux session')
    })
})

// ─── tmux_read ───

describe('tmux_read', () => {
    it('captures visible pane content', async () => {
        setupMocks()
        mockExec.mockResolvedValue({
            stdout: '$ npm test\nPASSED',
            exitCode: 0,
        })
        const result = await handleRead({ target: 'dev:0.0' })
        expect(mcpText(result)).toContain('npm test')
        expect(mcpText(result)).toContain('PASSED')
    })

    it('captures with history flag', async () => {
        setupMocks()
        mockExec.mockResolvedValue({
            stdout: 'long scrollback content',
            exitCode: 0,
        })
        const result = await handleRead({ target: 'dev:0.0', history: true })
        expect(mcpText(result)).toContain('long scrollback')
        // Verify -S - was used for full scrollback
        const args = mockExec.mock.calls[0][0]
        expect(args).toContain('-S')
        expect(args).toContain('-')
    })

    it('uses custom line count', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: 'output', exitCode: 0 })
        await handleRead({ target: 'dev:0.0', lines: 100 })
        const args = mockExec.mock.calls[0][0]
        expect(args).toContain('-100')
    })

    it('returns error for invalid target', async () => {
        setupMocks()
        const result = await handleRead({ target: ';rm -rf /' })
        expect(mcpError(result)).toContain('Invalid tmux target')
    })

    it('returns error when tmux not installed', async () => {
        setupMocks(false)
        const result = await handleRead({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('not installed')
    })

    it('returns error when no session', async () => {
        setupMocks(true, false)
        const result = await handleRead({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('No tmux session')
    })
})

// ─── tmux_send ───

describe('tmux_send', () => {
    it('sends literal text with enter', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: '', exitCode: 0 })
        const result = await handleSend({ target: 'dev:0.0', keys: 'npm test' })
        mcpText(result)
        // First call: send-keys -l for literal text
        expect(mockExec.mock.calls[0][0]).toContain('-l')
        expect(mockExec.mock.calls[0][0]).toContain('npm test')
        // Second call: send-keys Enter (without -l)
        expect(mockExec.mock.calls[1][0]).toContain('Enter')
        expect(mockExec.mock.calls[1][0]).not.toContain('-l')
    })

    it('sends literal text without enter', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: '', exitCode: 0 })
        const result = await handleSend({
            target: 'dev:0.0',
            keys: 'partial input',
            enter: false,
        })
        mcpText(result)
        // Only one call (literal text, no Enter)
        expect(mockExec.mock.calls).toHaveLength(1)
        expect(mockExec.mock.calls[0][0]).toContain('-l')
    })

    it('handles special key names literally via -l', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: '', exitCode: 0 })
        await handleSend({ target: 'dev:0.0', keys: 'Enter', enter: false })
        // Should use -l so "Enter" is literal text, not the Enter key
        expect(mockExec.mock.calls[0][0]).toContain('-l')
        expect(mockExec.mock.calls[0][0]).toContain('Enter')
    })

    it('returns error for invalid target', async () => {
        setupMocks()
        const result = await handleSend({ target: '$(whoami)', keys: 'test' })
        expect(mcpError(result)).toContain('Invalid tmux target')
    })

    it('returns error when tmux not installed', async () => {
        setupMocks(false)
        const result = await handleSend({ target: 'dev:0.0', keys: 'test' })
        expect(mcpError(result)).toContain('not installed')
    })
})

// ─── tmux_split ───

describe('tmux_split', () => {
    it('splits vertically by default and returns new target', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: 'dev:0.1', exitCode: 0 })
        const result = await handleSplit({ target: 'dev:0.0' })
        const text = mcpText(result)
        expect(text).toContain('dev:0.1')
        const args = mockExec.mock.calls[0][0]
        expect(args).toContain('-v')
    })

    it('splits horizontally when specified', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: 'dev:0.1', exitCode: 0 })
        await handleSplit({ target: 'dev:0.0', direction: 'horizontal' })
        const args = mockExec.mock.calls[0][0]
        expect(args).toContain('-h')
    })

    it('passes percent and command', async () => {
        setupMocks()
        mockExec.mockResolvedValue({ stdout: 'dev:0.1', exitCode: 0 })
        await handleSplit({ target: 'dev:0.0', percent: 30, command: 'htop' })
        const args = mockExec.mock.calls[0][0]
        expect(args).toContain('-p')
        expect(args).toContain('30')
        expect(args).toContain('htop')
    })

    it('returns error when tmux not installed', async () => {
        setupMocks(false)
        const result = await handleSplit({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('not installed')
    })

    it('returns error when no session', async () => {
        setupMocks(true, false)
        const result = await handleSplit({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('No tmux session')
    })
})

// ─── tmux_close ───

describe('tmux_close', () => {
    it('closes a pane', async () => {
        setupMocks()
        // list-panes returns 2 panes (safe to close one)
        mockExec.mockResolvedValueOnce({
            stdout: 'dev:0.0\t100\t30\tbash\t1\ndev:0.1\t100\t30\tnode\t0',
            exitCode: 0,
        })
        // kill-pane succeeds
        mockExec.mockResolvedValueOnce({ stdout: '', exitCode: 0 })
        const result = await handleClose({ target: 'dev:0.1' })
        mcpText(result)
    })

    it('refuses to close last pane in window', async () => {
        setupMocks()
        // list-panes returns only 1 pane
        mockExec.mockResolvedValueOnce({
            stdout: 'dev:0.0\t100\t30\tbash\t1',
            exitCode: 0,
        })
        const result = await handleClose({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('last pane')
    })

    it('returns error for invalid target', async () => {
        setupMocks()
        const result = await handleClose({ target: ';rm -rf /' })
        expect(mcpError(result)).toContain('Invalid tmux target')
    })

    it('returns error when tmux not installed', async () => {
        setupMocks(false)
        const result = await handleClose({ target: 'dev:0.0' })
        expect(mcpError(result)).toContain('not installed')
    })
})
