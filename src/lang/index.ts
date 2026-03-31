import type {
    LangConfig,
    LangEntry,
    LangTool,
    HookEvent,
    HookEventOrArray,
    GlobalsConfig,
} from "#config/types"
import { getBunScripts, getBunWorkspace } from "#tools/bun"
import { getPixiTasks, getPixiEnvironment } from "#tools/pixi"
import { getCargoInfo } from "#tools/cargo"
import { readFileSync, existsSync } from "fs"
import path from "path"
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

function evaluateToolResults(tool: LangTool, cwd: string): string[] {
    const results: string[] = []

    switch (tool.name) {
        case "bun":
        case "npm":
        case "pnpm":
            if (tool.scripts !== false) results.push(getBunScripts(tool, cwd))
            if (tool.workspace) results.push(getBunWorkspace(tool, cwd))
            break
        case "pixi":
            if (tool.tasks !== false) results.push(getPixiTasks(tool, cwd))
            if (tool.environment) results.push(getPixiEnvironment(tool, cwd))
            break
        case "cargo":
            results.push(getCargoInfo(tool, cwd))
            break
        case "uv":
        case "pip":
        case "ruff":
        case "clippy":
            // No extractable runtime output for these tools
            break
    }

    return results
}

export function evaluateLang(
    lang: LangConfig,
    event: HookEvent,
    cwd: string,
    globals?: GlobalsConfig,
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
                results.push(...evaluateToolResults(tool, cwd))
            }
        }

        // Process config entries
        if (entry.config) {
            for (const cfg of entry.config) {
                const fullPath = path.isAbsolute(cfg.path)
                    ? cfg.path
                    : path.join(cwd, cfg.path)

                if (cfg.inject) {
                    if (!eventMatches(event, langInjectOn)) continue
                    try {
                        const content = readFileSync(fullPath, "utf-8")
                        results.push(
                            xml.wrap("config", { attrs: { name: cfg.name }, inner: content }),
                        )
                    } catch {
                        // Skip unreadable configs
                    }
                }
                if (cfg.extractPaths) {
                    const extracted = extractTsconfigPaths(fullPath)
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
                xml.inline("path-alias", {
                    name,
                    target: String(
                        Array.isArray(targets) ? targets[0] : targets,
                    ),
                }),
            )
            .join("")

        if (!aliases) return null
        return xml.wrap("path-aliases", { inner: aliases })
    } catch {
        return null
    }
}
