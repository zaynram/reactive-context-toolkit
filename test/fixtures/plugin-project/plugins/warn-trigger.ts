export default {
    name: 'warn-trigger',
    trigger(_event: string, input: { toolName?: string }) {
        if (input.toolName === 'WarnTool') {
            return {
                action: 'warn' as const,
                message: 'WarnTool requires caution',
            }
        }
        return undefined
    },
}
