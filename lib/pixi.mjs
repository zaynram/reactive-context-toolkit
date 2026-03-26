import subprocess from "child_process"
import fs from "./fs.mjs"
import xml from "./xml.mjs"

/** @type {(o: unknown) => PixiTask} */
function validateTask(o) {
    if (typeof o === "object" && ["name", "description"].every(k => k in o))
        return { ...o, args: o.args ?? [] }
    else throw TypeError(`Received invalid task object: ${o}`)
}

/** @type {() => string} */
function getTasks() {
    /** @type {Record<string, string>[]} */
    const tasks = []
    const items = subprocess
        .execSync("pixi task list --json", {
            encoding: "utf-8",
            cwd: fs.resolve(),
            stdio: ["ignore", "pipe", "ignore"],
        })
        .trim()
    for (const env of JSON.parse(items) ?? []) {
        for (const feature of env.features ?? []) {
            for (const task of feature.tasks ?? []) {
                try {
                    const { name, description, args } = validateTask(task)
                    tasks.push({
                        name,
                        synopsis: description.split("Usage: ")[0],
                        usage: `pixi run ${name} ${args
                            .map(a =>
                                typeof a === "string"
                                    ? a
                                    : typeof a.default === "string"
                                      ? `[${a.name}=${a.default}]`
                                      : `<${a.name}>`,
                            )
                            .join(" ")}`.trim(),
                    })
                } catch {
                    continue
                }
            }
        }
    }
    const tag = "project-management"
    const options = {
        attrs: { "tool-name": "pixi" },
        inner: ["tasks", tasks],
        index: true,
    }
    return tasks ? xml.wrap(tag, options) : xml.inline(tag, options.attrs)
}

export default { tasks: getTasks() }

/**
 * @typedef PixiTaskArgumentType
 * @prop {string} name
 * @prop {string} [default]
 */

/**
 * @typedef {string | PixiTaskArgumentType} PixiTaskArgument
 */

/**
 * @typedef PixiTask
 * @prop {string} name
 * @prop {string} [description]
 * @prop {PixiTaskArgument[]} [args]
 */
