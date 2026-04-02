import { describe, expect, it } from 'bun:test'
import pluginRegistry from '#plugin/index'

describe('tmux plugin registration', () => {
    it('is in the plugin registry', () => {
        expect(pluginRegistry).toHaveProperty('rct-plugin-tmux')
    })

    it('has the correct name', () => {
        expect(pluginRegistry['rct-plugin-tmux']!.plugin.name).toBe(
            'rct-plugin-tmux',
        )
    })

    it('has no files or rules (v1 placeholder)', () => {
        const tmux = pluginRegistry['rct-plugin-tmux']!.plugin
        expect(tmux.files).toBeUndefined()
        expect(tmux.rules).toBeUndefined()
    })
})
