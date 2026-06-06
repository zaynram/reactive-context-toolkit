export default {
    name: 'warn-trigger',
    trigger(_event: string, input: { tool_name?: string }) {
        if (input.tool_name === 'WarnTool') {
            return { action: 'warn' as const, message: 'WarnTool requires caution' }
        }
        return undefined
    },
}
