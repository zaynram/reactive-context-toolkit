import { join } from 'node:path'

const SERVER_ENTRY = { command: 'bunx', args: ['rct-tmux', 'serve'] } as const

export async function runSetup() {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    const mcpPath = join(projectDir, '.mcp.json')
    const file = Bun.file(mcpPath)

    let data: Record<string, unknown> = {}
    if (await file.exists()) {
        try {
            data = await file.json()
        } catch {
            const raw = await file.text()
            console.warn(`[rct-tmux] Warning: ${mcpPath} contains invalid JSON — backing up and starting fresh`)
            await Bun.write(`${mcpPath}.bak`, raw)
            data = {}
        }
    }

    if (!data.mcpServers || typeof data.mcpServers !== 'object') {
        data.mcpServers = {}
    }

    ;(data.mcpServers as Record<string, unknown>)['rct-tmux'] = SERVER_ENTRY

    await Bun.write(mcpPath, JSON.stringify(data, null, 2) + '\n')
    console.log(`[rct-tmux] Wrote MCP server entry to ${mcpPath}`)
    console.log('[rct-tmux] Run "bunx rct-tmux serve" to start the server')
}
