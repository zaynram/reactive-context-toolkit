export default {
    name: 'block-trigger',
    trigger(_event: string, input: { tool_name?: string }) {
        if (input.tool_name === 'BlockedTool') {
            return {
                action: 'block' as const,
                message: 'BlockedTool is not allowed by plugin',
            }
        }
        return undefined
    },
}
