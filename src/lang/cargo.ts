import { readFileSync, existsSync } from "fs"
import type { LangTool } from "#config/types"
import { xml } from "#util"
import { resolveManifest } from "./manifest"

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
    const manifestPath = resolveManifest(tool, rootDir, "Cargo.toml")
    if (!existsSync(manifestPath)) return xml.inline("cargo")

    try {
        const content = readFileSync(manifestPath, "utf-8")
        const name = extractField(content, "name")
        const version = extractField(content, "version")

        if (!name && !version) return xml.inline("cargo")

        return xml.inline("cargo", {
            ...(name && { name }),
            ...(version && { version }),
        })
    } catch {
        return xml.inline("cargo")
    }
}
