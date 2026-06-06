import type { FileEntry } from '#config/types'

export namespace XML {
    type AttributeString = `${string}="${string}"`
    type OpenTag = `<${string}>` | `<${string} ${string}>`
    type CloseTag = `</${string}>`
    type InlineTag = `<${string}/>` | `<${string} ${string}/>`
    type Tree = `${OpenTag}${string}${CloseTag}`
    type Element = '' | Tree | InlineTag
}

export interface ReferenceFile {
    alias: string
    path: string
    brief?: string
    read: () => string
    staleCheck?: FileEntry['staleCheck']
}

export interface FileRegistry {
    get(alias: string): ReferenceFile | undefined
    getRef(ref: string): { file: ReferenceFile; useBrief: boolean } | undefined
    select(...aliases: string[]): ReferenceFile[]
    all(): ReferenceFile[]
    matchPath(filePath: string): ReferenceFile | undefined
}
