import { readFileSync } from "fs"
import path from "path"
import type { FileEntry, MetaFileEntry } from "./types"

export interface ReferenceFile {
  alias: string
  path: string
  brief?: string
  read: () => string
  staleCheck?: FileEntry["staleCheck"]
}

export interface FileRegistry {
  get(alias: string): ReferenceFile | undefined
  getRef(ref: string): { file: ReferenceFile; useBrief: boolean } | undefined
  select(...aliases: string[]): ReferenceFile[]
  all(): ReferenceFile[]
  matchPath(filePath: string): ReferenceFile | undefined
}

function normalizePath(p: string): string {
  return path.normalize(p).replaceAll("\\", "/")
}

function resolveFilePath(filePath: string, rootDir: string): string {
  if (path.isAbsolute(filePath)) return normalizePath(filePath)
  return normalizePath(path.resolve(rootDir, filePath))
}

function deriveAlias(entry: MetaFileEntry): string {
  return entry.alias ?? path.basename(entry.path)
}

export function buildFileRegistry(
  entries: FileEntry[],
  rootDir: string,
): FileRegistry {
  const files = new Map<string, ReferenceFile>()
  // metaFiles keyed by "parentAlias:metaAlias"
  const metaFiles = new Map<string, ReferenceFile>()

  for (const entry of entries) {
    const alias = deriveAlias(entry)
    const resolved = resolveFilePath(entry.path, rootDir)

    const ref: ReferenceFile = {
      alias,
      path: resolved,
      brief: entry.brief,
      read: () => readFileSync(resolved, "utf-8"),
      staleCheck: entry.staleCheck,
    }
    files.set(alias, ref)

    if (entry.metaFiles) {
      for (const meta of entry.metaFiles) {
        const metaAlias = deriveAlias(meta)
        const metaResolved = resolveFilePath(meta.path, rootDir)
        const metaRef: ReferenceFile = {
          alias: metaAlias,
          path: metaResolved,
          brief: meta.brief,
          read: () => readFileSync(metaResolved, "utf-8"),
        }
        metaFiles.set(`${alias}:${metaAlias}`, metaRef)
      }
    }
  }

  return {
    get(alias: string): ReferenceFile | undefined {
      return files.get(alias)
    },

    getRef(ref: string): { file: ReferenceFile; useBrief: boolean } | undefined {
      let useBrief = false
      let key = ref

      if (key.endsWith("~brief")) {
        useBrief = true
        key = key.slice(0, -6)
      }

      // Check colon notation for meta files
      if (key.includes(":")) {
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
      const normalized = normalizePath(filePath)
      for (const file of files.values()) {
        if (file.path === normalized) return file
      }
      return undefined
    },
  }
}
