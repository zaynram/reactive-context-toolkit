import { readFileSync, existsSync } from "fs"
import path from "path"
import type { LangTool } from "#config/types"
import { fs, xml } from "#util"

export default {
    name: "cargo",
    config: fs.resolve("Cargo.toml"),
} as LangTool

export function getCargoInfo(tool: LangTool, cwd: string): string {
    const manifestPath = tool.config ?? tool.manifest ?? path.join(cwd, "Cargo.toml")
    if (!existsSync(manifestPath)) return xml.inline("cargo")
    try {
        const content = readFileSync(manifestPath, "utf-8")
        const parsed = Bun.TOML.parse(content) as Record<
            string,
            Partial<Record<string, string>>
        >
        const { name, version } = parsed.package ?? {}
        if (!name && !version) return xml.inline("cargo")

        return xml.inline("cargo", {
            ...(name && { name }),
            ...(version && { version }),
        })
    } catch {
        return xml.inline("cargo")
    }
}
