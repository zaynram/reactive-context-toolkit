import type { LangTool } from "#config/types"
import { fs, xml, entries } from "#util"
export default {
    name: "bun",
    config: fs.resolve("bunfig.toml"),
    manifest: fs.resolve("package.json"),
} as LangTool

export function getBunScripts(): string {
    const pkg = JSON.parse(fs.read("package.json"))
    const scripts = pkg?.scripts as Record<string, string> | undefined
    if (!scripts || Object.keys(scripts).length === 0)
        return xml.inline("scripts")

    const inner = entries<string>(scripts)
        .map(([name, command]) => xml.inline("script", { name, command }))
        .join("")
    return xml.open("scripts") + inner + xml.close("scripts")
}

export function getBunWorkspace(): string {
    const pkg = JSON.parse(fs.read("package.json"))
    const workspaces = pkg?.workspaces as string[] | undefined
    if (!workspaces || workspaces.length === 0) return xml.inline("workspaces")

    const inner = workspaces
        .map(w => xml.inline("workspace", { path: w }))
        .join("")
    return xml.open("workspaces") + inner + xml.close("workspaces")
}
