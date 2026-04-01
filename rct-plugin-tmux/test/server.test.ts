import { describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/mcp/server'

describe('MCP server', () => {
    async function createTestClient() {
        const server = createServer()
        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair()

        const client = new Client({
            name: 'test-client',
            version: '0.1.0',
        })

        await Promise.all([
            client.connect(clientTransport),
            server.connect(serverTransport),
        ])

        return client
    }

    it('completes initialize handshake', async () => {
        const client = await createTestClient()
        // If we get here, handshake succeeded
        expect(client).toBeDefined()
        await client.close()
    })

    it('lists all 5 tools', async () => {
        const client = await createTestClient()
        const { tools } = await client.listTools()
        const names = tools.map((t) => t.name)
        expect(names).toContain('tmux_list')
        expect(names).toContain('tmux_read')
        expect(names).toContain('tmux_send')
        expect(names).toContain('tmux_split')
        expect(names).toContain('tmux_close')
        expect(tools).toHaveLength(5)
        await client.close()
    })

    it('returns error response when tmux is unavailable', async () => {
        const client = await createTestClient()
        const result = await client.callTool({
            name: 'tmux_list',
            arguments: {},
        })
        // On CI/test without tmux, we get an error response (not a crash)
        expect(result.content).toBeDefined()
        expect(Array.isArray(result.content)).toBe(true)
        await client.close()
    })
})
