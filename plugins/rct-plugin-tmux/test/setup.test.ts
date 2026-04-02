import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSetup } from '#setup'

describe('setup command', () => {
    let tempDir: string
    let origCwd: string

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'rct-tmux-setup-'))
        origCwd = process.cwd()
        process.chdir(tempDir)
    })

    afterEach(async () => {
        process.chdir(origCwd)
        await rm(tempDir, { recursive: true, force: true })
    })

    it('creates .mcp.json when missing', async () => {
        await runSetup()
        const content = await Bun.file(join(tempDir, '.mcp.json')).json()
        expect(content.mcpServers['rct-tmux']).toEqual({
            command: 'bunx',
            args: ['rct-tmux', 'serve'],
        })
    })

    it('merges into existing .mcp.json without clobbering', async () => {
        await Bun.write(
            join(tempDir, '.mcp.json'),
            JSON.stringify({
                mcpServers: {
                    'other-server': { command: 'node', args: ['serve'] },
                },
            }),
        )
        await runSetup()
        const content = await Bun.file(join(tempDir, '.mcp.json')).json()
        expect(content.mcpServers['other-server']).toEqual({
            command: 'node',
            args: ['serve'],
        })
        expect(content.mcpServers['rct-tmux']).toBeDefined()
    })

    it('updates existing rct-tmux entry', async () => {
        await Bun.write(
            join(tempDir, '.mcp.json'),
            JSON.stringify({
                mcpServers: { 'rct-tmux': { command: 'old', args: [] } },
            }),
        )
        await runSetup()
        const content = await Bun.file(join(tempDir, '.mcp.json')).json()
        expect(content.mcpServers['rct-tmux'].command).toBe('bunx')
    })

    it('handles malformed .mcp.json gracefully', async () => {
        await Bun.write(join(tempDir, '.mcp.json'), 'not json{{{')
        await runSetup()
        const content = await Bun.file(join(tempDir, '.mcp.json')).json()
        expect(content.mcpServers['rct-tmux']).toBeDefined()
    })
})
