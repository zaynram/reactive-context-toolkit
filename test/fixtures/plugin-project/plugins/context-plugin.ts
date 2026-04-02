export default {
    name: 'context-plugin',
    context(event: string) {
        if (event === 'SessionStart') {
            return '<dynamic-context>tmux layout data</dynamic-context>'
        }
        return undefined
    },
}
