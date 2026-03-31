import { readFileSync } from "fs"
import path from "path"
import type { LangTool } from "#config/types"
import { xml, entries } from "#util"

export function getBunScripts(tool: LangTool, cwd: string): string {
    const manifestPath = tool.manifest ?? path.join(cwd, "package.json")
    try {
        const pkg = JSON.parse(readFileSync(manifestPath, "utf-8"))
        const scripts = pkg?.scripts as Record<string, string> | undefined
        if (!scripts || Object.keys(scripts).length === 0)
            return xml.inline("scripts")

        const inner = entries<string>(scripts)
            .map(([name, command]) => xml.inline("script", { name, command }))
            .join("")
        return xml.open("scripts") + inner + xml.close("scripts")
    } catch {
        return xml.inline("scripts")
    }
}

export function getBunWorkspace(tool: LangTool, cwd: string): string {
    const manifestPath = tool.manifest ?? path.join(cwd, "package.json")
    try {
        const pkg = JSON.parse(readFileSync(manifestPath, "utf-8"))
        const workspaces = pkg?.workspaces as string[] | undefined
        if (!workspaces || workspaces.length === 0) return xml.inline("workspaces")

        const inner = workspaces
            .map(w => xml.inline("workspace", { path: w }))
            .join("")
        return xml.open("workspaces") + inner + xml.close("workspaces")
    } catch {
        return xml.inline("workspaces")
    }
}
