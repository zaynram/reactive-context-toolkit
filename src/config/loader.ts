import { existsSync, readFileSync } from "fs"
import path from "path"
import type { RCTConfig } from "./types"
import { CLAUDE_PROJECT_DIR } from "#constants"

const CONFIG_NAMES = ["rct.config.ts", "rct.config.js", "rct.config.json"]

export async function loadConfig(root?: string): Promise<RCTConfig> {
    const dir = root ?? CLAUDE_PROJECT_DIR

    for (const name of CONFIG_NAMES) {
        const configPath = path.resolve(dir, name)
        if (!existsSync(configPath)) continue

        if (name.endsWith(".json")) {
            return JSON.parse(readFileSync(configPath, "utf-8")) as RCTConfig
        }

        // For .ts / .js: dynamic import, get .default
        const mod = await import(configPath)
        return (mod.default ?? mod) as RCTConfig
    }

    return {}
}
