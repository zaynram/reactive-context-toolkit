import { RCTPlugin } from '#plugin/types'

export class PluginValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PluginValidationError'
    }
}

export function validatePlugin(
    plugin: unknown,
    ref: string,
): asserts plugin is RCTPlugin {
    if (!plugin || typeof plugin !== 'object' || !('name' in plugin)) {
        throw new PluginValidationError(
            `Plugin '${ref}' must export an object with a 'name' property.`,
        )
    }
}
