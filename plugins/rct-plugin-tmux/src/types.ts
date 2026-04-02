import type {
    ServerNotification,
    ServerRequest,
} from '@modelcontextprotocol/sdk/types.js'
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { z } from 'zod'
export type * from '@modelcontextprotocol/sdk/server/mcp.js'
export type ToolOptions<I extends z.ZodTypeAny> = Pick<
    RegisteredTool,
    'title' | 'description' | 'inputSchema'
> & { title: string; inputSchema?: I }
export type ToolCallbackExtra = RequestHandlerExtra<
    ServerRequest,
    ServerNotification
>
