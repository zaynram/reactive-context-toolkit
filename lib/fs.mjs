// .claude/hooks/lib/fs.mjs
import { existsSync, readFileSync } from "fs"
import path from "path"
import { minify, normalize } from "./util.mjs"
const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

/**
 * @param {string[]} segments
 */
function checkResolved(segments) {
    const base = path.join(...segments)
    return !existsSync(base) && !path.isAbsolute(base) ? null : base
}

/** @param {...string} segments @returns {string} */
const resolve = (...segments) =>
    normalize(checkResolved(segments) ?? path.resolve(ROOT, ...segments))

/**
 * Read file content. Tries the joined path directly; falls back to resolving against ROOT.
 * @param {...string} segments @returns {string}
 */
const read = (...segments) =>
    minify(readFileSync(resolve(...segments), "utf-8"))

export default { resolve, read }
