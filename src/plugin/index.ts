import { BUILTIN_PLUGINS } from '#constants'
import type { RCTPlugin, BuiltinPlugins, InstalledBuiltinPlugin } from './types'
import { validatePlugin } from './validate'

async function importBuiltin(name: string): Promise<RCTPlugin> {
    // Try package resolution first (workspace installs)
    try {
        const { default: plugin } = await import(name)
        return plugin
    } catch {
        // Fall back to relative path (GitHub installs where plugins/ ships alongside src/)
        // import.meta.resolve returns a file:// URL which import() accepts
        const resolved = import.meta.resolve(
            `../../plugins/${name}/src/index.ts`,
        )
        const { default: plugin } = await import(resolved)
        return plugin
    }
}

const results = await Promise.allSettled(
    BUILTIN_PLUGINS.map(async (name) => {
        const plugin = await importBuiltin(name)
        validatePlugin(plugin, name)
        return plugin
    }),
)

export default Object.fromEntries(
    results
        .map((r, i) => [BUILTIN_PLUGINS[i], r] as const)
        .filter(([, r]) => r.status === 'fulfilled')
        .map(([name, r]) => [
            name,
            {
                plugin: (r as PromiseFulfilledResult<RCTPlugin>).value,
                ref: name,
                source: 'builtin',
            } as InstalledBuiltinPlugin,
        ]),
) as BuiltinPlugins
