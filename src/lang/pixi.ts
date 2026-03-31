import { execSync } from "child_process"
import path from "path"
import type { LangTool } from "#config/types"
import { xml } from "#util"

interface PixiTaskArgument {
    name: string
    default?: string
}

interface PixiTask {
    name: string
    description?: string
    args?: (string | PixiTaskArgument)[]
}

function validateTask(o: unknown): PixiTask {
    if (o && typeof o === "object" && "name" in o)
        return {
            ...(o as PixiTask),
            description: "description" in o ? (o as PixiTask).description : "",
            args: "args" in o ? ((o as PixiTask).args ?? []) : [],
        }
    throw TypeError(`Received invalid task object: ${o}`)
}

export function getPixiTasks(tool: LangTool, cwd: string): string {
    const resolvedCwd = tool.manifest ? path.dirname(tool.manifest) : cwd
    try {
        const items = execSync("pixi task list --json", {
            encoding: "utf-8",
            cwd: resolvedCwd,
            stdio: ["ignore", "pipe", "ignore"],
        }).trim()

        const tasks: { name: string; synopsis: string; usage: string }[] = []
        for (const env of JSON.parse(items) ?? []) {
            for (const feature of env.features ?? []) {
                for (const task of feature.tasks ?? []) {
                    try {
                        const { name, description, args } = validateTask(task)
                        tasks.push({
                            name,
                            synopsis: description?.split("Usage: ")[0] ?? "",
                            usage: `pixi run ${name} ${(args ?? [])
                                .map((a: string | PixiTaskArgument) =>
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

        if (tasks.length === 0)
            return xml.inline("pixi-tasks", { unavailable: "no tasks found" })

        const inner = tasks
            .map((t, i) =>
                xml.inline("task", {
                    index: String(i + 1),
                    name: t.name,
                    synopsis: t.synopsis,
                    usage: t.usage,
                }),
            )
            .join("")
        return xml.open("pixi-tasks") + inner + xml.close("pixi-tasks")
    } catch {
        return xml.inline("pixi-tasks", {
            unavailable: "pixi not found or command failed",
        })
    }
}

export function getPixiEnvironment(tool: LangTool, cwd: string): string {
    const resolvedCwd = tool.manifest ? path.dirname(tool.manifest) : cwd
    try {
        const output = execSync("pixi info --json", {
            encoding: "utf-8",
            cwd: resolvedCwd,
            stdio: ["ignore", "pipe", "ignore"],
        }).trim()

        const info = JSON.parse(output)
        const platform = info.platform ?? "unknown"
        const version = info.pixi_version ?? info.version ?? "unknown"
        return xml.inline("pixi-environment", { platform, version })
    } catch {
        return xml.inline("pixi-environment", {
            unavailable: "pixi not found or command failed",
        })
    }
}
