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
        const resolved = import.meta.resolve(`../../plugins/${name}/src/index.ts`)
        const { default: plugin } = await import(resolved)
        return plugin
    }
}

async function resolveBuiltins(): Promise<BuiltinPlugins> {
    const results = await Promise.allSettled(
        BUILTIN_PLUGINS.map(async name => {
            const plugin = await importBuiltin(name)
            validatePlugin(plugin, name)
            return plugin
        })
    )

    return Object.fromEntries(
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
            ])
    ) as BuiltinPlugins
}

let cache: Promise<BuiltinPlugins> | undefined

/**
 * Lazily resolve and memoize the built-in plugin registry.
 *
 * Deferring these dynamic imports out of module-evaluation is load-bearing:
 * each built-in plugin imports the `rct` barrel back, so resolving them at
 * module-load time (a top-level `await`) deadlocks the ESM graph in dev/test,
 * where `rct` resolves to the live `src/index.ts` that is still mid-evaluation.
 * Resolving on first use instead lets the barrel finish evaluating first.
 */
export default function getBuiltins(): Promise<BuiltinPlugins> {
    return (cache ??= resolveBuiltins())
}
