import type { RCTPlugin } from '#plugin/types'
import path from 'path'

/**
 * Define a plugin for RCT. Typed identity function that validates
 * the plugin shape at compile time and resolves relative file paths.
 */
export function definePlugin(
    plugin: RCTPlugin,
    setup?: (plugin: RCTPlugin) => void,
): RCTPlugin {
    if (plugin.files) {
        plugin.files = plugin.files.map((f) => ({
            ...f,
            path:
                path.isAbsolute(f.path) ?
                    f.path
                :   path.resolve(process.cwd(), f.path),
        }))
    }
    if (setup) setup(plugin)
    return plugin
}
