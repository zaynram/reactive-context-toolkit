import { readFileSync, existsSync } from "fs"
import type { LangTool } from "#config/types"
import { xml, entries } from "#util"
import { resolveManifest } from "./manifest"

function readPackageJson(
    tool: LangTool,
    rootDir: string,
): Record<string, unknown> | null {
    const manifestPath = resolveManifest(tool, rootDir, "package.json")
    if (!existsSync(manifestPath)) return null
    try {
        return JSON.parse(readFileSync(manifestPath, "utf-8"))
    } catch {
        return null
    }
}

export function getBunScripts(tool: LangTool, rootDir: string): string {
    const pkg = readPackageJson(tool, rootDir)
    const scripts = pkg?.scripts as Record<string, string> | undefined
    if (!scripts || Object.keys(scripts).length === 0) return xml.inline("scripts")

    const inner = entries<string>(scripts)
        .map(([name, command]) => xml.inline("script", { name, command }))
        .join("")
    return xml.open("scripts") + inner + xml.close("scripts")
}

export function getBunWorkspace(tool: LangTool, rootDir: string): string {
    const pkg = readPackageJson(tool, rootDir)
    const workspaces = pkg?.workspaces as string[] | undefined
    if (!workspaces || workspaces.length === 0) return xml.inline("workspaces")

    const inner = workspaces
        .map((w) => xml.inline("workspace", { path: w }))
        .join("")
    return xml.open("workspaces") + inner + xml.close("workspaces")
}
