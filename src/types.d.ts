import type {
    HookEvent as _HookEvent,
    HookInput as _HookInput,
    BaseHookInput,
    PreToolUseHookInput,
    PostToolUseHookInput,
    HookJSONOutput as _HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk'

declare namespace RC {
    type HookSpecificOutput<T extends _HookEvent = _HookEvent> =
        Required<_HookJSONOutput>['hookSpecificOutput'] & {
            hookEventName: T
            additionalContext: string
        }

    type HookJSONOutput<T extends HookEvent = HookEvent> = _HookJSONOutput & {
        hookSpecificOutput: HookSpecificOutput<T>
    }

    type ExtraHookJSONOutput<T extends HookEvent = HookEvent> = Omit<
        _HookJSONOutput<T>,
        'hookSpecificOutput'
    >

    type HookEvent = HookSpecificOutput['hookEventName']
    type InjectFunction<T extends HookEvent = HookEvent> = (
        output: HookSpecificOutput<T>,
    ) => void

    type HookInput<T extends HookEvent = HookEvent> = BaseHookInput & {
        hookEventName: T
        inject: InjectFunction
    } & _HookInput
}

declare namespace XML {
    type AttributeString = `${string}="${string}"`
    type OpenTag = `<${string}>` | `<${string} ${string}>`
    type CloseTag = `</${string}>`
    type InlineTag = `<${string}/>` | `<${string} ${string}/>`
    type Tree = `${OpenTag}${string}${CloseTag}`
    type Element = '' | Tree | InlineTag
}

declare interface ReferenceFile {
    alias: string
    path: string
    brief?: string
    read: () => string
    staleCheck?: FileEntry['staleCheck']
}

declare interface FileRegistry {
    get(alias: string): ReferenceFile | undefined
    getRef(ref: string): { file: ReferenceFile; useBrief: boolean } | undefined
    select(...aliases: string[]): ReferenceFile[]
    all(): ReferenceFile[]
    matchPath(filePath: string): ReferenceFile | undefined
}
