import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTmuxTools } from './tools'
export function createServer() {
    const server = new McpServer({ name: 'rct-tmux', version: '0.1.0' })
    void registerTmuxTools(server)
    return server
}

export async function startServer() {
    try {
        const server = createServer()
        const transport = new StdioServerTransport()
        await server.connect(transport)
    } catch (err) {
        console.error(
            `[rct-tmux] Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`,
        )
        process.exit(1)
    }
}
