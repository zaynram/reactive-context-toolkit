import type { RCTConfig } from './types'
import { CLAUDE_PROJECT_DIR } from '#constants'
import { fs } from '#util'

const CONFIG_NAMES = ['rct.config.ts', 'rct.config.js', 'rct.config.json']

export async function loadConfig(root?: string): Promise<RCTConfig> {
    const dir = root ?? CLAUDE_PROJECT_DIR

    for (const name of CONFIG_NAMES) {
        const configPath = fs.resolve(name, { root: dir })
        const file = Bun.file(configPath)
        if (!(await file.exists())) continue

        if (name.endsWith('.json')) {
            return (await file.json()) as RCTConfig
        }

        // For .ts / .js: dynamic import, get .default
        const mod = await import(configPath)
        return (mod.default ?? mod) as RCTConfig
    }

    return {}
}
