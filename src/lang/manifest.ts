import path from "path"
import type { LangTool } from "#config/types"

export function resolveManifest(
    tool: LangTool,
    rootDir: string,
    defaultFile: string,
): string {
    if (tool.manifest) {
        return path.isAbsolute(tool.manifest)
            ? tool.manifest
            : path.resolve(rootDir, tool.manifest)
    }
    return path.join(rootDir, defaultFile)
}
