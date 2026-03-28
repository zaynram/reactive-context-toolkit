import { readFileSync, existsSync } from "fs"
import path from "path"
import type { LangTool } from "#config/types"

function resolveManifest(tool: LangTool, rootDir: string): string {
    if (tool.manifest) {
        return path.isAbsolute(tool.manifest)
            ? tool.manifest
            : path.resolve(rootDir, tool.manifest)
    }
    return path.join(rootDir, "Cargo.toml")
}

function extractField(content: string, field: string): string | null {
    // Simple regex extraction for fields under [package]
    const packageMatch = content.match(/\[package\]([\s\S]*?)(?:\n\[|\s*$)/)
    if (!packageMatch) return null
    const section = packageMatch[1]
    const fieldMatch = section.match(
        new RegExp(`^\\s*${field}\\s*=\\s*"([^"]*)"`, "m"),
    )
    return fieldMatch ? fieldMatch[1] : null
}

export function getCargoInfo(tool: LangTool, rootDir: string): string {
    const manifestPath = resolveManifest(tool, rootDir)
    if (!existsSync(manifestPath)) return `<cargo/>`

    try {
        const content = readFileSync(manifestPath, "utf-8")
        const name = extractField(content, "name")
        const version = extractField(content, "version")

        if (!name && !version) return `<cargo/>`

        const attrs: string[] = []
        if (name) attrs.push(`name="${name}"`)
        if (version) attrs.push(`version="${version}"`)
        return `<cargo ${attrs.join(" ")}/>`
    } catch {
        return `<cargo/>`
    }
}
