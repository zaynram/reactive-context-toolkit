import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { handleList } from './tools/list'
import { handleRead } from './tools/read'
import { handleSend } from './tools/send'
import { handleSplit } from './tools/split'
import { handleClose } from './tools/close'

export function createServer() {
    const server = new McpServer({ name: 'rct-tmux', version: '0.1.0' })

    server.tool(
        'tmux_list',
        'List all panes in the current or specified session with metadata',
        { session: z.string().optional().describe('Session name filter') },
        async ({ session }) => handleList({ session }),
    )

    server.tool(
        'tmux_read',
        'Capture the visual buffer from a tmux pane',
        {
            target: z.string().describe('Pane target (e.g., session:0.1)'),
            lines: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('Number of lines to capture (default: 50)'),
            history: z
                .boolean()
                .optional()
                .describe('Include full scrollback history'),
        },
        async ({ target, lines, history }) =>
            handleRead({ target, lines, history }),
    )

    server.tool(
        'tmux_send',
        'Send keys (commands) to a tmux pane',
        {
            target: z.string().describe('Pane target'),
            keys: z.string().describe('Text to send'),
            enter: z
                .boolean()
                .optional()
                .describe('Append Enter key (default: true)'),
        },
        async ({ target, keys, enter }) => handleSend({ target, keys, enter }),
    )

    server.tool(
        'tmux_split',
        'Create a new pane by splitting an existing one',
        {
            target: z.string().optional().describe('Pane to split'),
            direction: z
                .enum(['horizontal', 'vertical'])
                .optional()
                .describe('Split direction (default: vertical)'),
            percent: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .describe('Size percentage (default: 50)'),
            command: z
                .string()
                .optional()
                .describe('Command to run in new pane'),
        },
        async ({ target, direction, percent, command }) =>
            handleSplit({ target, direction, percent, command }),
    )

    server.tool(
        'tmux_close',
        'Close a tmux pane (refuses to close last pane in its window)',
        { target: z.string().describe('Pane to close') },
        async ({ target }) => handleClose({ target }),
    )

    return server
}

export async function startServer() {
    try {
        const server = createServer()
        const transport = new StdioServerTransport()
        await server.connect(transport)
    } catch (err) {
        console.error(
            `[rct-tmux] Failed to start MCP server: ${err instanceof Error ? err.message : err}`,
        )
        process.exit(1)
    }
}
