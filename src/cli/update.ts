import { deriveFromProject } from '#config/derive'
import {
    validateConfig,
    applyPlugins,
    desugarFileInjections,
} from '#config/schema'
import { mergeSettings } from './init'
import { fs } from '#util'
import type { RCTConfig } from '#config/types'

function deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

export default async function updateRCT(_args: string[] = []) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const configPath = fs.resolve('rct.config.json', { root })

    if (!fs.exists(configPath)) {
        console.error('No rct.config.json found. Run `rct init` first.')
        process.exit(1)
    }

    // Load existing config
    let existing: RCTConfig & { _derived?: Record<string, unknown> }
    try {
        existing = JSON.parse(fs.readRaw(configPath))
    } catch {
        console.error('Error: rct.config.json contains invalid JSON.')
        process.exit(1)
    }

    const baseline = existing._derived as Record<string, unknown> | undefined
    const fresh = deriveFromProject(root)
    const freshRecord = {
        lang: fresh.lang,
        test: fresh.test,
        files: fresh.files,
        globals: fresh.globals,
    } as Record<string, unknown>

    // Three-way merge per top-level field
    const merged: Record<string, unknown> = { ...existing }
    const configKeys = ['lang', 'test', 'files', 'globals'] as const

    if (!baseline) {
        // Bootstrap: no _derived key → preserve all current, only add new fields
        for (const key of configKeys) {
            if (!(key in existing) && freshRecord[key] != null) {
                merged[key] = freshRecord[key]
            }
        }
    } else {
        for (const key of configKeys) {
            const currentVal = (existing as Record<string, unknown>)[key]
            const baselineVal = baseline[key]
            const freshVal = freshRecord[key]

            if (deepEqual(currentVal, baselineVal)) {
                // Auto-generated, safe to update
                if (freshVal != null) {
                    merged[key] = freshVal
                } else {
                    delete merged[key]
                }
            }
            // else: consumer customized → preserve

            // New detection not in baseline
            if (baselineVal == null && freshVal != null && !(key in existing)) {
                merged[key] = freshVal
            }
        }
    }

    // Write new _derived baseline
    merged._derived = freshRecord

    // Remove _derived from the config before processing
    const { _derived, ...configWithoutDerived } = merged as RCTConfig & {
        _derived?: Record<string, unknown>
    }

    // Validate and resolve for settings
    const validated = validateConfig(configWithoutDerived as RCTConfig)
    const { config: withPlugins } = await applyPlugins(validated)
    const desugared = desugarFileInjections(withPlugins)

    // Write config with _derived
    await fs.write(configPath, JSON.stringify(merged, null, 2))
    console.log(`Updated ${configPath}`)

    // Update settings
    const settingsPath = fs.resolve(['.claude', 'settings.json'], { root })
    await mergeSettings(settingsPath, desugared)
    console.log(`Updated ${settingsPath}`)
}
