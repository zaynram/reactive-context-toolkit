import subprocess from "child_process"
import { fs } from "#util"
import { xml, WrapXMLOptions } from "#util"

function validateTask(o: unknown) {
    if (o && typeof o === "object" && "name" in o)
        return {
            ...o,
            description: "description" in o ? o.description : "",
            args: "args" in o ? (o.args ?? []) : [],
        } as Required<PixiTask>
    else throw TypeError(`Received invalid task object: ${o}`)
}

function getTasks(): string {
    const tasks: Record<string, string>[] = []
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
                        synopsis: description?.split("Usage: ")[0],
                        usage: `pixi run ${name} ${args
                            .map((a: PixiTaskArgument) =>
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
    const [tag, attrs] = ["project-management", { "tool-name": "pixi" }]
    return tasks
        ? xml.wrap(tag, {
              attrs,
              inner: { tag: "tasks", items: tasks },
              index: true,
          } as WrapXMLOptions)
        : xml.inline(tag, attrs)
}

export default { tasks: getTasks() }

type PixiTaskArgument = string | { name: string; default?: string }
interface PixiTask {
    name: string
    description?: string
    args?: PixiTaskArgument[]
}
