import type { RCTPlugin } from '#plugin/types'
import path from 'path'

/**
 * Define a plugin for RCT. Typed identity function that validates
 * the plugin shape at compile time and resolves relative file paths.
 */
export function definePlugin(plugin: RCTPlugin): RCTPlugin {
    if (plugin.files) {
        plugin.files = plugin.files.map((f) => ({
            ...f,
            path:
                path.isAbsolute(f.path) ?
                    f.path
                :   path.resolve(process.cwd(), f.path),
            metaFiles: f.metaFiles?.map((mf) => ({
                ...mf,
                path:
                    path.isAbsolute(mf.path) ?
                        mf.path
                    :   path.resolve(process.cwd(), mf.path),
            })),
        }))
    }
    return plugin
}
