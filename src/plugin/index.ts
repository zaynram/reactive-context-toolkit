import { BUILTIN_PLUGINS } from '#constants'
import type { RCTPlugin, BuiltinPlugins, InstalledBuiltinPlugin } from './types'
import { validatePlugin } from './validate'

const results = await Promise.allSettled(
    BUILTIN_PLUGINS.map(async (name) => {
        const { default: plugin } = await import(name)
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
