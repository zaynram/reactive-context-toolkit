import type {
    LangConfig,
    LangEntry,
    LangTool,
    HookEvent,
    HookEventOrArray,
    GlobalsConfig,
} from "#config/types"
import { getPixiTasks, getPixiEnvironment } from "./pixi"
import { getBunScripts, getBunWorkspace } from "./bun"
import { getCargoInfo } from "./cargo"
import { readFileSync, existsSync } from "fs"
import { xml } from "#util"

function eventMatches(
    event: HookEvent,
    injectOn?: HookEventOrArray,
    fallback: HookEvent = "SessionStart",
): boolean {
    const target = injectOn ?? fallback
    if (Array.isArray(target)) return target.includes(event)
    return target === event
}

function evaluateToolResults(
    tool: LangTool,
    rootDir: string,
): string[] {
    const results: string[] = []

    switch (tool.name) {
        case "bun":
        case "npm":
        case "pnpm":
            if (tool.scripts !== false) results.push(getBunScripts(tool, rootDir))
            if (tool.workspace) results.push(getBunWorkspace(tool, rootDir))
            break
        case "pixi":
            if (tool.tasks !== false) results.push(getPixiTasks(tool, rootDir))
            if (tool.environment) results.push(getPixiEnvironment(tool, rootDir))
            break
        case "uv":
        case "pip":
        case "pipx":
            // Python package managers without task runner support — no output
            break
        case "cargo":
        case "cargo-binstall":
        case "rustup":
            results.push(getCargoInfo(tool, rootDir))
            break
    }

    return results
}

export function evaluateLang(
    lang: LangConfig,
    event: HookEvent,
    rootDir: string,
    globals: GlobalsConfig,
): string[] {
    const results: string[] = []

    const langEntries: [string, LangEntry | undefined][] = [
        ["typescript", lang.typescript],
        ["javascript", lang.javascript],
        ["python", lang.python],
        ["rust", lang.rust],
    ]

    for (const [, entry] of langEntries) {
        if (!entry) continue
        const langInjectOn = entry.injectOn

        // Process tools
        if (entry.tools) {
            for (const tool of entry.tools) {
                const toolInjectOn = tool.injectOn ?? langInjectOn
                if (!eventMatches(event, toolInjectOn)) continue
                results.push(...evaluateToolResults(tool, rootDir))
            }
        }

        // Process config entries
        if (entry.config) {
            for (const cfg of entry.config) {
                if (cfg.inject) {
                    if (!eventMatches(event, langInjectOn)) continue
                    try {
                        const content = readFileSync(cfg.path, "utf-8")
                        results.push(
                            xml.open("config", { name: cfg.name }) + content + xml.close("config"),
                        )
                    } catch {
                        // Skip unreadable configs
                    }
                }
                if (cfg.extractPaths) {
                    const extracted = extractTsconfigPaths(cfg.path)
                    if (extracted) results.push(extracted)
                }
            }
        }
    }

    return results
}

export function extractTsconfigPaths(configPath: string): string | null {
    if (!existsSync(configPath)) return null

    try {
        const content = readFileSync(configPath, "utf-8")
        const config = JSON.parse(content)
        const paths = config?.compilerOptions?.paths
        if (!paths || typeof paths !== "object") return null

        const aliases = Object.entries(paths)
            .map(([name, targets]) =>
                xml.inline("path-alias", { name, target: String(Array.isArray(targets) ? targets[0] : targets) }),
            )
            .join("")

        if (!aliases) return null
        return xml.open("path-aliases") + aliases + xml.close("path-aliases")
    } catch {
        return null
    }
}
