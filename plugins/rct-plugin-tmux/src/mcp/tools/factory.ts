import type { ToolOptions, ToolCallback, McpServer } from '#types'
import { z } from 'zod'
import type { McpResultSchema } from './helpers'

export interface McpTool<T extends z.ZodObject<z.ZodRawShape>> {
    name: string
    options: ToolOptions<T>
    handler: (params: z.infer<T>) => Promise<z.infer<McpResultSchema>>
}

export function createTool<T extends z.ZodObject<z.ZodRawShape>>(
    options: ToolOptions<T>,
    handler: (params: z.infer<T>) => Promise<z.infer<McpResultSchema>>,
) {
    const name = options.title
        .split(' ')
        .map((s) => s.toLowerCase())
        .join('_')
    return {
        name,
        options,
        handler,
        register: (server: McpServer) =>
            server.registerTool<McpResultSchema, T>(
                name,
                options,
                handler as ToolCallback<T>,
            ),
    }
}

export default createTool
