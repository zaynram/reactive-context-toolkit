import { minify } from "./util.mjs"

/**
 * Sync hook registration — for events with no stdin (e.g. SessionStart).
 * @param {string} hookEventName
 * @returns {{ inject: (additionalContext: string) => void }}
 */
const sync = hookEventName => ({
    inject: additionalContext =>
        console.log(
            minify(
                JSON.stringify({
                    hookSpecificOutput: { hookEventName, additionalContext },
                }),
            ),
        ),
})

/**
 * Async hook registration — reads JSON from stdin (e.g. PreToolUse, PostToolUse).
 * @param {string} hookEventName
 * @returns {Promise<{
 *   input: StandardInput,
 *   inject: (additionalContext: string) => void
 * } | void>}
 */
const stdin = hookEventName =>
    new Promise(resolve => {
        let data = ""
        process.stdin.on("data", chunk => (data += chunk))
        process.stdin.on("end", () => {
            try {
                resolve({
                    input: JSON.parse(data) ?? {},
                    ...sync(hookEventName),
                })
            } catch {
                resolve()
            }
        })
        process.stdin.on("error", () => resolve())
    })

export default { sync, stdin }

/**
 * @typedef StandardInput
 * @prop {{
 *   file_path?: string,
 *   new_string?: string,
 *   contents?: string,
 *   edits?: string[]
 * }} tool_input
 */
