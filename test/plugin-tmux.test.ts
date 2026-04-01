import { describe, expect, it } from 'bun:test'
import pluginRegistry from '#plugin/index'

describe('tmux plugin registration', () => {
    it('is in the plugin registry', () => {
        expect(pluginRegistry).toHaveProperty('tmux')
    })

    it('has the correct name', () => {
        expect(pluginRegistry['tmux'].name).toBe('tmux')
    })

    it('has no files or rules (v1 placeholder)', () => {
        const tmux = pluginRegistry['tmux']
        expect(tmux.files).toBeUndefined()
        expect(tmux.rules).toBeUndefined()
    })
})
