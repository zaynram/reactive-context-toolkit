import { fs } from '#util'
import type { FileEntry, MetaFileEntry } from './types'
import { normalize } from '#util/general'
import type { ReferenceFile, FileRegistry } from '#types'
import { CLAUDE_PROJECT_DIR } from '#constants'

export type { ReferenceFile, FileRegistry }

function deriveAlias(entry: MetaFileEntry): string {
    return entry.alias ?? fs.stem(entry.path)
}

export function buildFileRegistry(
    entries: FileEntry[],
    rootDir: string = CLAUDE_PROJECT_DIR,
): FileRegistry {
    const files = new Map<string, ReferenceFile>()
    // metaFiles keyed by "parentAlias:metaAlias"
    const metaFiles = new Map<string, ReferenceFile>()

    const options = { strict: true, root: rootDir } as const

    for (const entry of entries) {
        const alias = deriveAlias(entry)
        const resolved = fs.resolve(entry.path, options)

        const ref: ReferenceFile = {
            alias,
            path: resolved,
            brief: entry.brief,
            read: () => fs.read(resolved, { ...options }),
            staleCheck: entry.staleCheck,
        }
        files.set(alias, ref)

        if (entry.metaFiles) {
            for (const meta of entry.metaFiles) {
                const metaAlias = deriveAlias(meta)
                const metaResolved = fs.resolve(meta.path, options)
                const metaRef: ReferenceFile = {
                    alias: metaAlias,
                    path: metaResolved,
                    brief: meta.brief,
                    read: () => fs.read(metaResolved, { ...options }),
                }
                metaFiles.set(`${alias}:${metaAlias}`, metaRef)
            }
        }
    }

    return {
        get(alias: string): ReferenceFile | undefined {
            return files.get(alias)
        },

        getRef(
            ref: string,
        ): { file: ReferenceFile; useBrief: boolean } | undefined {
            let useBrief = false
            let key = ref

            if (key.endsWith('~brief')) {
                useBrief = true
                key = key.slice(0, -6)
            }

            // Check colon notation for meta files
            if (key.includes(':')) {
                const metaFile = metaFiles.get(key)
                if (metaFile) return { file: metaFile, useBrief }
                return undefined
            }

            const file = files.get(key)
            if (file) return { file, useBrief }
            return undefined
        },

        select(...aliases: string[]): ReferenceFile[] {
            return aliases
                .map((a) => files.get(a))
                .filter((f): f is ReferenceFile => f !== undefined)
        },

        all(): ReferenceFile[] {
            return Array.from(files.values())
        },

        matchPath(filePath: string): ReferenceFile | undefined {
            const normalized = normalize(filePath)
            for (const file of files.values()) {
                if (file.path === normalized) return file
            }
            return undefined
        },
    }
}
