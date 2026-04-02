import type { ToolOptions, ToolCallback, McpServer } from '#types'
import { z } from 'zod'
import { McpResult, preflight, type McpResultSchema } from './helpers'

export interface McpTool<T extends z.ZodObject<z.ZodRawShape>> {
    name: string
    options: ToolOptions<T>
    handler: (params: z.infer<T>) => Promise<McpResult>
}

export function createTool<T extends z.ZodObject<z.ZodRawShape>>(
    options: ToolOptions<T>,
    handler: (params: z.infer<T>) => Promise<McpResult>,
) {
    const tool: McpTool<T> = {
        name: options.title
            .split(' ')
            .map((s) => s.toLowerCase())
            .join('_'),
        options,
        handler: async (params, _ = undefined) => {
            const check = await preflight(params.target)
            if (check) return check
            return await handler(params as z.infer<T>)
        },
    }
    return {
        ...tool,
        register: (server: McpServer) =>
            server.registerTool<McpResultSchema, T>(
                tool.name,
                options,
                tool.handler as ToolCallback<T>,
            ),
    }
}

export default createTool
