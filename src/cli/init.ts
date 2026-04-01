#!/usr/bin/env bun
import type {
    RCTConfig,
    LangConfig,
    LangEntry,
    LangTool,
} from '../config/types'
import { readdirSync } from 'fs'
import { fs } from '#util'
import { deriveFromProject, type DerivedConfig } from '#config/derive'
import {
    validateConfig,
    applyPlugins,
    desugarFileInjections,
} from '#config/schema'
import { ask, confirm, select } from './prompt'
import plugins from '#plugin/index'
import { Glob } from 'bun'

interface DetectionResult {
    lang: LangConfig
    testCommand: string | null
    files: { alias: string; path: string }[]
}

type NodePackageManager = 'bun' | 'pnpm' | 'npm'

export function detectProject(root: string): DetectionResult {
    const lang: LangConfig = {}
    const files: { alias: string; path: string }[] = []
    const testCmds: string[] = []

    const at = (name: string) => fs.resolve(name, { root })
    const has = (name: string) => fs.exists(at(name))

    // Detect TypeScript/JavaScript
    const hasPkg = has('package.json')
    const hasTsconfig = has('tsconfig.json')

    if (hasPkg || hasTsconfig) {
        // Detect package manager from lockfile
        let pmName: NodePackageManager | undefined
        if (has('bun.lock') || has('bun.lockb')) pmName = 'bun'
        else if (has('pnpm-lock.yaml')) pmName = 'pnpm'
        else if (has('package-lock.json')) pmName = 'npm'

        const tool: LangTool | undefined =
            pmName ? { name: pmName, scripts: true } : undefined

        // Get test command from package.json scripts
        if (tool && hasPkg) {
            try {
                const pkg = JSON.parse(fs.readRaw(at('package.json')))
                const testScript: string | undefined = pkg?.scripts?.test
                if (testScript) testCmds.push(testScript)
            } catch {
                // Ignore unreadable package.json
            }
        }

        const entry: LangEntry = { tools: tool ? [tool] : [] }

        if (hasTsconfig) {
            entry.config = [{ name: 'tsconfig', path: at('tsconfig.json') }]
        }
        lang.node = entry
    }

    // Detect Python
    const hasPixiToml = has('pixi.toml')
    const hasPyproject = has('pyproject.toml')

    if (hasPixiToml || hasPyproject) {
        const tools: LangTool[] = []
        if (hasPixiToml) {
            tools.push({ name: 'pixi', tasks: true, environment: true })
            testCmds.push('pixi run test')
        }
        lang.python = { tools }
    }

    // Detect Rust
    if (has('Cargo.toml')) {
        lang.rust = { tools: [{ name: 'cargo' }] }
        testCmds.push('cargo test')
    }

    return {
        lang,
        testCommand: testCmds.length ? testCmds.join(' && ') : null,
        files,
    }
}

export function generateConfig(detection: DetectionResult): RCTConfig {
    const config: RCTConfig = {}

    if (Object.keys(detection.lang).length > 0) {
        config.lang = detection.lang
    }

    if (detection.testCommand) {
        config.test = {
            command: detection.testCommand,
            injectOn: 'SessionStart',
        }
    }

    if (detection.files.length > 0) {
        config.files = detection.files.map((f) => ({
            alias: f.alias,
            path: f.path,
            injectOn: 'SessionStart' as const,
        }))
    }

    return config
}

function collectRequiredEvents(config: RCTConfig): Set<string> {
    const events = new Set<string>(['SessionStart']) // always needed

    for (const rule of config.rules ?? []) events.add(rule.on)
    for (const inj of config.injections ?? []) events.add(inj.on)
    for (const file of config.files ?? []) {
        const on = file.injectOn
        if (on) (Array.isArray(on) ? on : [on]).forEach((e) => events.add(e))
    }
    if (config.lang) {
        for (const entry of Object.values(config.lang)) {
            if (!entry) continue
            const on = entry.injectOn
            if (on)
                (Array.isArray(on) ? on : [on]).forEach((e) => events.add(e))
            for (const tool of entry.tools ?? []) {
                const ton = tool.injectOn
                if (ton)
                    (Array.isArray(ton) ? ton : [ton]).forEach((e) =>
                        events.add(e),
                    )
            }
        }
    }
    if (config.test && typeof config.test === 'object') {
        const on = (config.test as { injectOn?: string | string[] }).injectOn
        if (on) (Array.isArray(on) ? on : [on]).forEach((e) => events.add(e))
    }
    if (config.meta) {
        const on = config.meta.injectOn
        if (on) (Array.isArray(on) ? on : [on]).forEach((e) => events.add(e))
    }

    return events
}

export async function mergeSettings(
    settingsPath: string,
    config: RCTConfig,
): Promise<void> {
    // Read existing settings.json
    let settings: Record<string, any> = {}
    if (fs.exists(settingsPath)) {
        try {
            settings = JSON.parse(fs.readRaw(settingsPath))
        } catch {
            console.error(
                `Error: ${settingsPath} contains invalid JSON. Fix it before running rct init.`,
            )
            process.exit(1)
        }
    }

    // Merge hooks (don't overwrite existing)
    if (!settings.hooks) settings.hooks = {}

    const hookCommand = 'bun run rct hook'

    // Collect all required events from every config section
    const requiredEvents = collectRequiredEvents(config)

    // Collect matchers for PreToolUse and PostToolUse from rules and injections
    const preToolMatchers = new Set<string>()
    const postToolMatchers = new Set<string>()

    for (const rule of config.rules ?? []) {
        if (rule.matcher) {
            const matchers =
                rule.on === 'PreToolUse' ? preToolMatchers : postToolMatchers
            rule.matcher.split('|').forEach((m) => matchers.add(m))
        }
    }
    for (const inj of config.injections ?? []) {
        const matchers =
            inj.on === 'PreToolUse' ? preToolMatchers : postToolMatchers
        if (inj.matcher) {
            inj.matcher.split('|').forEach((m) => matchers.add(m))
        }
        if (inj.matchFile) {
            postToolMatchers.add('Read')
        }
    }

    // Generate hook entries for each required event
    for (const event of requiredEvents) {
        if (settings.hooks[event]) continue // don't overwrite existing

        const hook = { type: 'command', command: `${hookCommand} ${event}` }

        if (event === 'PreToolUse' && preToolMatchers.size > 0) {
            const matcher = Array.from(preToolMatchers).join('|')
            settings.hooks[event] = [{ matcher, hooks: [hook] }]
        } else if (event === 'PostToolUse' && postToolMatchers.size > 0) {
            const matcher = Array.from(postToolMatchers).join('|')
            settings.hooks[event] = [{ matcher, hooks: [hook] }]
        } else {
            settings.hooks[event] = [{ hooks: [hook] }]
        }
    }

    // Ensure directory exists
    fs.mkdir(fs.dir(settingsPath))

    await fs.write(settingsPath, JSON.stringify(settings, null, 2))
}

export function discoverPlugins(root: string): string[] {
    const discovered: string[] = []

    // Built-in plugins from the registry
    discovered.push(...Object.keys(plugins))

    // Local plugins in .claude/hooks/rct/
    const hookDir = fs.resolve(['.claude', 'hooks', 'rct'], { root })
    if (fs.exists(hookDir)) {
        const glob = new Glob('*.{ts,js}')
        for (const file of glob.scanSync(hookDir)) {
            discovered.push(`.claude/hooks/rct/${file}`)
        }
    }

    // Installed plugin packages (rct-plugin-*)
    const nmDir = fs.resolve('node_modules', { root })
    if (fs.exists(nmDir)) {
        for (const entry of readdirSync(nmDir)) {
            if (entry.startsWith('rct-plugin-')) {
                discovered.push(entry)
            }
        }
    }

    return discovered
}

function buildConfigFromDerived(
    derived: DerivedConfig,
    overrides?: {
        plugins?: string[]
        format?: 'xml' | 'json'
        testCache?: boolean
    },
): RCTConfig {
    const config: RCTConfig = {}

    // Globals
    const globals: RCTConfig['globals'] = { format: overrides?.format ?? 'xml' }
    if (overrides?.plugins && overrides.plugins.length > 0) {
        globals.plugins = overrides.plugins
    }
    config.globals = globals

    // Lang
    if (Object.keys(derived.lang).length > 0) {
        config.lang = derived.lang
    }

    // Test
    if (derived.test) {
        config.test = { ...derived.test }
        if (overrides?.testCache) {
            ;(config.test as any).cache = true
        }
    }

    // Files
    if (derived.files.length > 0) {
        config.files = derived.files
    }

    return config
}

// CLI entry point
export default async function initializeRCT(args: string[] = []) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const hasYesFlag = args.includes('--yes') || args.includes('-y')
    const interactive = process.stdin.isTTY && !hasYesFlag

    const configPath = fs.resolve('rct.config.json', { root })

    // Check for existing config
    if (fs.exists(configPath)) {
        if (interactive) {
            const overwrite = await confirm(
                'rct.config.json already exists. Overwrite?',
                false,
            )
            if (!overwrite) {
                console.log('Aborted.')
                return
            }
        } else {
            console.log(
                'rct.config.json already exists. Use interactive mode to overwrite.',
            )
            return
        }
    }

    console.log('Detecting project structure...')
    const derived = deriveFromProject(root)

    let config: RCTConfig
    if (!interactive) {
        // Non-interactive: use derived defaults directly
        config = buildConfigFromDerived(derived)
    } else {
        // Interactive wizard
        const detectedLangs = Object.keys(derived.lang)
        if (detectedLangs.length > 0) {
            console.log(`Detected languages: ${detectedLangs.join(', ')}`)
            const keepLangs = await confirm('Use detected languages?')
            if (!keepLangs) {
                // Let user edit which languages to keep
                const chosen = await select(
                    'Select languages to keep:',
                    detectedLangs,
                    detectedLangs,
                )
                for (const lang of detectedLangs) {
                    if (!chosen.includes(lang)) {
                        delete derived.lang[lang as keyof typeof derived.lang]
                    }
                }
            }

            // Per language: confirm PM and test command
            for (const [langName, entry] of Object.entries(derived.lang)) {
                if (!entry) continue
                const tools = entry.tools ?? []
                if (tools.length > 0) {
                    const toolNames = tools.map((t) => t.name).join(', ')
                    console.log(`  ${langName}: detected tools: ${toolNames}`)
                    const keepTools = await confirm(
                        `  Use detected tools for ${langName}?`,
                    )
                    if (!keepTools) {
                        entry.tools = []
                    }
                }
            }

            if (derived.test) {
                console.log(`Detected test command: ${derived.test.command}`)
                const keepTest = await confirm('Use detected test command?')
                if (!keepTest) {
                    derived.test = null
                }
            }
        } else {
            console.log('No languages detected.')
        }

        // Plugins
        const availablePlugins = discoverPlugins(root)
        const selectedPlugins = await select(
            'Enable plugins:',
            availablePlugins,
            [],
        )

        // Output format
        const formatAnswer = await ask('Output format', 'xml')
        const format =
            formatAnswer === 'json' ? ('json' as const) : ('xml' as const)

        // Test caching
        let testCache = false
        if (derived.test) {
            testCache = await confirm('Enable test result caching?', false)
        }

        config = buildConfigFromDerived(derived, {
            plugins: selectedPlugins,
            format,
            testCache,
        })
    }

    // Write config with _derived key
    const configWithDerived = { ...config, _derived: derived }
    await fs.write(configPath, JSON.stringify(configWithDerived, null, 2))
    console.log(`Created ${configPath}`)

    // Apply plugins and desugar to get full config for mergeSettings
    const validated = validateConfig(config)
    const { config: withPlugins } = await applyPlugins(validated)
    const fullConfig = desugarFileInjections(withPlugins)

    const settingsPath = fs.resolve(['.claude', 'settings.json'], { root })
    await mergeSettings(settingsPath, fullConfig)
    console.log(`Updated ${settingsPath}`)
}
