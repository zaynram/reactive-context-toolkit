import type { RCTConfig, HookEvent } from '#config/types'

/** Result from a plugin's dynamic trigger function. */
export interface PluginTriggerResult {
    action: 'block' | 'warn'
    message: string
}

/** Input passed to plugin context/trigger functions — matches what the hook pipeline actually has. */
export interface PluginHookInput {
    toolName?: string
    payload: Record<string, unknown>
}

export interface RCTPlugin extends Pick<RCTConfig, 'rules' | 'files'> {
    name: string
    context?: (
        event: HookEvent,
        input: PluginHookInput,
    ) => string | undefined | Promise<string | undefined>
    trigger?: (
        event: HookEvent,
        input: PluginHookInput,
    ) =>
        | PluginTriggerResult
        | undefined
        | Promise<PluginTriggerResult | undefined>
}
