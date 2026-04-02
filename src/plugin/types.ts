import type { RCTConfig, HookEvent } from '#config/types'
import { BUILTIN_PLUGINS } from '#constants'

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
    name?: string
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
    setup?: () => void | Promise<void>
    /** Which events trigger context(). Omit = all events. */
    contextOn?: HookEvent | HookEvent[]
    /** How often context() fires. 'always' (default), 'once' per session, or a max count. */
    contextFrequency?: 'once' | 'always' | number
}

export function displayName(plugin: RCTPlugin, ref: string): string {
    const raw = plugin.name ?? ref
    return raw.replace(/^rct-plugin-/, '')
}

export type PluginSource = 'builtin' | 'local' | 'package'
export interface ResolvedPlugin {
    plugin: RCTPlugin
    source: PluginSource
    ref: string
}

export type BuiltinPluginRef = (typeof BUILTIN_PLUGINS)[number]
export interface InstalledBuiltinPlugin extends ResolvedPlugin {
    source: 'builtin'
    ref: BuiltinPluginRef
}

export type BuiltinPlugins = Partial<
    Record<BuiltinPluginRef, InstalledBuiltinPlugin>
>
