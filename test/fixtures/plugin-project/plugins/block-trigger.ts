export default {
    name: 'block-trigger',
    trigger(_event: string, input: { toolName?: string }) {
        if (input.toolName === 'BlockedTool') {
            return {
                action: 'block' as const,
                message: 'BlockedTool is not allowed by plugin',
            }
        }
        return undefined
    },
}
