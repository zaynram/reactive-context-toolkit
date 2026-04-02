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
    if (!plugin || typeof plugin !== 'object') {
        throw new PluginValidationError(
            `Plugin '${ref}' must export an object.`,
        )
    }
    const p = plugin as Record<string, unknown>
    const check = (key: string, type: string) => {
        if (key in p && typeof p[key] !== type) {
            throw new PluginValidationError(
                `Plugin '${ref}' property '${key}' must be ${type}, got ${typeof p[key]}`,
            )
        }
    }
    check('name', 'string')
    check('context', 'function')
    check('trigger', 'function')
    check('setup', 'function')
    if ('files' in p && !Array.isArray(p.files)) {
        throw new PluginValidationError(
            `Plugin '${ref}' property 'files' must be an array`,
        )
    }
    if ('rules' in p && !Array.isArray(p.rules)) {
        throw new PluginValidationError(
            `Plugin '${ref}' property 'rules' must be an array`,
        )
    }
}
