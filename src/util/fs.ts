import { existsSync, readFileSync } from "fs"
import { minify, normalize } from "./general"
import path from "path"
import { CLAUDE_PROJECT_DIR, RCT_PREFIX } from "#constants"
import type { ReferenceFile } from "#types"

const ROOT = CLAUDE_PROJECT_DIR

interface ResolveOptions {
    strict?: true
    root?: string
}

export function source(relativePath: string | string[]) {
    if (typeof relativePath !== "string")
        relativePath = path.join(...relativePath)
    return path.resolve(RCT_PREFIX, relativePath)
}

export function config(
    name: `${string}.${"json" | "toml" | "yaml" | `lock${"" | "b"}`}`,
    root: string = ROOT,
): ReferenceFile | void {
    const fp = path.join(root, name)
    if (!existsSync(fp)) return
    return {
        alias: stem(fp).toLowerCase(),
        path: fp,
        read: () => minify(readFileSync(fp, "utf-8")),
    }
}

export const resolve = (
    p: string | string[],
    { strict, root = ROOT }: ResolveOptions = {},
): string => {
    if (typeof p !== "string") p = path.join(...p)
    return normalize(
        path.isAbsolute(p) && (!strict || existsSync(p))
            ? p
            : path.join(root, p),
    )
}

/**
 * Read file content. Tries the joined path directly; falls back to resolving against ROOT.
 */
export const read = (
    p: string | string[],
    { root = ROOT }: Omit<ResolveOptions, "strict"> = {},
): string => minify(readFileSync(resolve(p, { strict: true, root }), "utf-8"))

export const stem = (p: string) => {
    const basename = path.basename(p)
    return basename.includes(".")
        ? basename.substring(0, basename.lastIndexOf("."))
        : basename
}

export const fs = {
    resolve,
    read,
    config,
    stem,
    source,
    name: path.basename,
    dir: path.dirname,
    exists: existsSync,
}
export default fs
