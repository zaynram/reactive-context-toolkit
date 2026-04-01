import type { RCTPlugin } from './types'
import plugins from './index'
import { CLAUDE_PROJECT_DIR } from '#constants'
import path from 'path'

export type PluginSource = 'builtin' | 'local' | 'package'

export interface ResolvedPlugin {
    plugin: RCTPlugin
    source: PluginSource
    ref: string
}

class PluginValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PluginValidationError'
    }
}

function validatePlugin(
    plugin: unknown,
    ref: string,
): asserts plugin is RCTPlugin {
    if (!plugin || typeof plugin !== 'object' || !('name' in plugin)) {
        throw new PluginValidationError(
            `Plugin '${ref}' must export an object with a 'name' property.`,
        )
    }
}

export async function resolvePlugin(ref: string): Promise<ResolvedPlugin> {
    // 1. Built-in name
    if (ref in plugins) {
        return { plugin: plugins[ref], source: 'builtin', ref }
    }

    // 2. Local file (starts with . or /)
    if (ref.startsWith('.') || ref.startsWith('/')) {
        const fullPath =
            path.isAbsolute(ref) ? ref : path.resolve(CLAUDE_PROJECT_DIR, ref)
        try {
            const mod = await import(fullPath)
            const plugin = mod.default ?? mod
            validatePlugin(plugin, ref)
            return { plugin, source: 'local', ref }
        } catch (err: unknown) {
            if (err instanceof PluginValidationError) throw err
            const detail = err instanceof Error ? `: ${err.message}` : ''
            throw new Error(
                `Failed to load plugin '${ref}' from '${fullPath}'${detail}`,
            )
        }
    }

    // 3. Package
    try {
        const mod = await import(ref)
        const plugin = mod.default ?? mod
        validatePlugin(plugin, ref)
        return { plugin, source: 'package', ref }
    } catch (err: unknown) {
        if (err instanceof PluginValidationError) throw err
        const detail = err instanceof Error ? `: ${err.message}` : ''
        throw new Error(`Failed to load plugin '${ref}'${detail}`)
    }
}
