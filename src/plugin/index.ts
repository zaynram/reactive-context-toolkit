import { BUILTIN_PLUGINS } from '#constants'
import { BuiltinPlugins, InstalledBuiltinPlugin } from './types'
import { validatePlugin } from './validate'

const results = await Promise.allSettled(
    BUILTIN_PLUGINS.map(async (name) => {
        const { default: plugin } = await import(name)
        try {
            validatePlugin(plugin, name)
            return Promise.resolve(plugin)
        } catch {
            return Promise.reject()
        }
    }),
)

// todo: wire in

export default Object.fromEntries(
    results
        .filter((r) => r.status === 'fulfilled')
        .map((x) => [
            x.value.name,
            {
                plugin: x.value,
                ref: x.value.name,
                source: 'builtin',
            } as InstalledBuiltinPlugin,
        ]),
) as BuiltinPlugins
