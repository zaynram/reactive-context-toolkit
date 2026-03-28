import { existsSync, readFileSync } from "fs"
import path from "path"

export const CLAUDE_PROJECT_DIR =
    process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const CONFIG_FILENAME = "rct.config.json"

function loadConfig(): RCTConfig {
    const configPath = path.resolve(CLAUDE_PROJECT_DIR, CONFIG_FILENAME)
    if (!existsSync(configPath)) return {}
    return JSON.parse(readFileSync(configPath, "utf-8"))
}

export const config = loadConfig()

export interface PixiToolConfig {
    injectTasks?: boolean
}

export interface ToolConfig {
    pixi?: PixiToolConfig
}

export interface RCTConfig {
    files?: Record<string, string[]>
    tool?: ToolConfig
}
