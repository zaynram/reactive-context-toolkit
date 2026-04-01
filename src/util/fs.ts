import { existsSync, readFileSync, mkdirSync } from 'fs'
import { minify, normalize } from './general'
import path from 'path'
import { CLAUDE_PROJECT_DIR } from '#constants'
import type { ReferenceFile } from '#types'

const ROOT = CLAUDE_PROJECT_DIR
export const RCT_PREFIX = path.join(
    CLAUDE_PROJECT_DIR,
    'node_modules',
    'reactive-context-toolkit',
)

interface ResolveOptions {
    strict?: true
    root?: string
}

export function source(relativePath: string | string[]) {
    if (typeof relativePath !== 'string')
        relativePath = path.join(...relativePath)
    return path.resolve(RCT_PREFIX, relativePath)
}

export function config(
    name: `${string}.${'json' | 'toml' | 'yaml' | `lock${'' | 'b'}`}`,
    root: string = ROOT,
): ReferenceFile | void {
    const fp = path.join(root, name)
    if (!existsSync(fp)) return
    return {
        alias: stem(fp).toLowerCase(),
        path: fp,
        read: () => minify(readFileSync(fp, 'utf-8')),
    }
}

export const resolve = (
    p: string | string[],
    { strict, root = ROOT }: ResolveOptions = {},
): string => {
    if (typeof p !== 'string') p = path.join(...p)
    return normalize(
        path.isAbsolute(p) && (!strict || existsSync(p)) ?
            p
        :   path.join(root, p),
    )
}

/**
 * Read file content. Tries the joined path directly; falls back to resolving against ROOT.
 */
export const read = (
    p: string | string[],
    { root = ROOT }: Omit<ResolveOptions, 'strict'> = {},
): string => minify(readFileSync(resolve(p, { strict: true, root }), 'utf-8'))

export const stem = (p: string) => {
    const basename = path.basename(p)
    return basename.includes('.') ?
            basename.substring(0, basename.lastIndexOf('.'))
        :   basename
}

/** Read file content without any minification — use for JSON/TOML parsing. */
export const readRaw = (p: string): string => readFileSync(p, 'utf-8')

/** Write file content using Bun.write (async). */
export const write = (p: string, content: string): Promise<number> =>
    Bun.write(p, content)

/** Create directory (and parents) if it doesn't exist. */
export const mkdir = (p: string): void => {
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

export const fs = {
    resolve,
    read,
    readRaw,
    write,
    mkdir,
    config,
    stem,
    source,
    name: path.basename,
    dir: path.dirname,
    exists: existsSync,
    isAbsolute: path.isAbsolute,
    join: path.join,
}
export default fs
