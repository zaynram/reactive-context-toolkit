import { readFileSync, existsSync } from "fs"
import path from "path"
import type { LangTool } from "#config/types"

function resolveManifest(tool: LangTool, rootDir: string): string {
    if (tool.manifest) {
        return path.isAbsolute(tool.manifest)
            ? tool.manifest
            : path.resolve(rootDir, tool.manifest)
    }
    return path.join(rootDir, "package.json")
}

function readPackageJson(
    tool: LangTool,
    rootDir: string,
): Record<string, unknown> | null {
    const manifestPath = resolveManifest(tool, rootDir)
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
    if (!scripts || Object.keys(scripts).length === 0) return `<scripts/>`

    const inner = Object.entries(scripts)
        .map(([name, command]) => `<script name="${name}" command="${command}"/>`)
        .join("")
    return `<scripts>${inner}</scripts>`
}

export function getBunWorkspace(tool: LangTool, rootDir: string): string {
    const pkg = readPackageJson(tool, rootDir)
    const workspaces = pkg?.workspaces as string[] | undefined
    if (!workspaces || workspaces.length === 0) return `<workspaces/>`

    const inner = workspaces
        .map((w) => `<workspace path="${w}"/>`)
        .join("")
    return `<workspaces>${inner}</workspaces>`
}
