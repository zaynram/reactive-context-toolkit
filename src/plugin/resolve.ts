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

export async function resolvePlugin(ref: string): Promise<ResolvedPlugin> {
    // 1. Built-in name
    if (ref in plugins) {
        return { plugin: plugins[ref], source: 'builtin', ref }
    }

    // 2. Local file (starts with . or /)
    if (ref.startsWith('.') || ref.startsWith('/')) {
        const fullPath = path.isAbsolute(ref)
            ? ref
            : path.resolve(CLAUDE_PROJECT_DIR, ref)
        try {
            const mod = await import(fullPath)
            const plugin = mod.default ?? mod
            if (!plugin?.name) {
                throw new Error(
                    `Plugin at '${ref}' must export an object with a 'name' property.`,
                )
            }
            return { plugin: plugin as RCTPlugin, source: 'local', ref }
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('name')) throw err
            throw new Error(
                `Plugin '${ref}' not found at '${fullPath}'. Ensure the file exists.`,
            )
        }
    }

    // 3. Package
    try {
        const mod = await import(ref)
        const plugin = mod.default ?? mod
        if (!plugin?.name) {
            throw new Error(
                `Plugin package '${ref}' must export an object with a 'name' property.`,
            )
        }
        return { plugin: plugin as RCTPlugin, source: 'package', ref }
    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('name')) throw err
        throw new Error(
            `Plugin '${ref}' not found. Install it with: bun add ${ref}`,
        )
    }
}
