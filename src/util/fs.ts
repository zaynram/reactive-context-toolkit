// .claude/hooks/lib/fs.mjs
import { existsSync, readFileSync } from "fs"
import { minify, normalize } from "./general"
import path from "path"

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

function checkResolved(segments: string[]): string | null {
    const base = path.join(...segments)
    return !existsSync(base) && !path.isAbsolute(base) ? null : base
}

const resolve = (...segments: string[]): string =>
    normalize(checkResolved(segments) ?? path.resolve(ROOT, ...segments))

/**
 * Read file content. Tries the joined path directly; falls back to resolving against ROOT.
 */
const read = (...segments: string[]): string =>
    minify(readFileSync(resolve(...segments), "utf-8"))

export const fs = { resolve, read }
export default fs
