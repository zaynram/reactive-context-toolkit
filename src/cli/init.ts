#!/usr/bin/env bun

import { deriveFromProject, type DerivedConfig } from '#config/derive'
import { validateConfig, applyPlugins, desugarFileInjections } from '#config/schema'
import type {
    RCTConfig,
    LangConfig,
    LangEntry,
    LangTool,
    HookEvent,
    HookEventOrArray,
    RuleEntry,
    InjectionEntry,
} from '#config/types'
import plugins from '#plugin/index'
import { fs } from '#util'
import { ask, confirm, select } from './prompt'
import { Glob } from 'bun'
import { readdirSync } from 'node:fs'

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

        const tool: LangTool | undefined = pmName
            ? { name: pmName, scripts: true }
            : undefined

        // Get test command from package.json scripts
        if (tool && hasPkg)
            try {
                type PackageJSON = { scripts?: { test?: string } }
                const pkg = fs.readJson<PackageJSON>(at('package.json'))
                if (pkg?.scripts?.test) testCmds.push(pkg.scripts.test)
            } catch {
                // Ignore unreadable package.json
            }

        const entry: LangEntry = { tools: tool ? [tool] : [] }
        if (hasTsconfig) entry.config = [{ name: 'tsconfig', path: at('tsconfig.json') }]
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

    return { lang, testCommand: testCmds.length ? testCmds.join(' && ') : null, files }
}

export function generateConfig(detection: DetectionResult): RCTConfig {
    const config: RCTConfig = {}
    if (Object.keys(detection.lang).length > 0) config.lang = detection.lang
    if (detection.testCommand)
        config.test = { command: detection.testCommand, injectOn: 'SessionStart' }
    if (detection.files.length > 0)
        config.files = detection.files.map(f => ({
            alias: f.alias,
            path: f.path,
            injectOn: 'SessionStart' as const,
        }))
    return config
}

function collectRequiredEvents(config: RCTConfig): Set<HookEvent> {
    const events: Set<HookEvent> = new Set(['SessionStart'])
    const mergeEvents = (on?: HookEventOrArray) =>
        ([on].flat().filter(Boolean) as HookEvent[]).forEach(events.add)

    for (const rule of config.rules ?? []) mergeEvents(rule.on)
    for (const inj of config.injections ?? []) mergeEvents(inj.on)
    for (const file of config.files ?? []) mergeEvents(file.injectOn)

    if (config.lang)
        Object.values(config.lang)
            .filter(Boolean)
            .forEach(entry => {
                mergeEvents(entry.injectOn)
                if (entry.tools) entry.tools.forEach(tool => mergeEvents(tool.injectOn))
            })

    if (config.test && typeof config.test === 'object')
        [config.test.injectOn].flat().forEach(e => e && events.add(e))

    if (config.meta) [config.meta.injectOn].flat().forEach(e => e && events.add(e))

    return events
}

export async function mergeSettings(
    settingsPath: string,
    config: RCTConfig
): Promise<void> {
    // Read existing settings.json
    const settings = await Bun.file(settingsPath)
        .json()
        .then(data => data as Record<string, any>)
        .catch(() =>
            Bun.stderr
                .write(`error: ${settingsPath} contains invalid JSON`)
                .then(() => process.exit(1))
        )

    if (!settings.hooks) settings.hooks = {}
    // Merge hooks (don't overwrite existing)
    const hookCommand = 'bun run rct hook'
    // Collect all required events from every config section
    const requiredEvents = collectRequiredEvents(config)
    // Collect matchers for PreToolUse and PostToolUse from rules and injections
    const preToolMatchers = new Set<string>()
    const postToolMatchers = new Set<string>()

    const processEntryMatcher = (item: RuleEntry | InjectionEntry) => {
        if (!item.matcher) return
        const group = item.on === 'PreToolUse' ? preToolMatchers : postToolMatchers
        item.matcher.split('|').forEach(group.add)
        if ('matchFile' in item && item.matchFile) postToolMatchers.add('Read')
    }

    const queue = [...(config.rules ?? []), ...(config.injections ?? [])]
    queue.forEach(processEntryMatcher)

    // Generate hook entries for each required event
    for (const event of requiredEvents) {
        if (settings.hooks[event]) continue // don't overwrite existing

        const hook = { type: 'command', command: `${hookCommand} ${event}` }

        if (event === 'PreToolUse' && preToolMatchers.size > 0)
            settings.hooks[event] = [
                { matcher: Array.from(preToolMatchers).join('|'), hooks: [hook] },
            ]
        else if (event === 'PostToolUse' && postToolMatchers.size > 0)
            settings.hooks[event] = [
                { matcher: Array.from(postToolMatchers).join('|'), hooks: [hook] },
            ]
        else settings.hooks[event] = [{ hooks: [hook] }]
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
    if (fs.exists(hookDir))
        for (const file of new Glob('*.{ts,js}').scanSync(hookDir))
            discovered.push(`.claude/hooks/rct/${file}`)

    // Installed plugin packages (rct-plugin-*)
    const nmDir = fs.resolve('node_modules', { root })
    if (fs.exists(nmDir))
        for (const entry of readdirSync(nmDir))
            if (entry.startsWith('rct-plugin-')) discovered.push(entry)

    return discovered
}

function buildConfigFromDerived(
    derived: DerivedConfig,
    overrides?: { plugins?: string[]; format?: 'xml' | 'json'; testCache?: boolean }
): RCTConfig {
    const config: RCTConfig = {}

    // Globals
    const globals: RCTConfig['globals'] = { format: overrides?.format ?? 'xml' }
    if (overrides?.plugins && overrides.plugins.length > 0)
        globals.plugins = overrides.plugins

    config.globals = globals

    // Lang
    if (Object.keys(derived.lang).length > 0) config.lang = derived.lang

    // Test
    if (derived.test) {
        config.test = { ...derived.test }
        if (overrides?.testCache) (config.test as any).cache = true
    }

    // Files
    if (derived.files.length > 0) config.files = derived.files

    return config
}

// CLI entry point
export default async function initializeRCT(args: string[] = []) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const hasYesFlag = args.includes('--yes') || args.includes('-y')
    const interactive = process.stdin.isTTY && !hasYesFlag

    const configPath = fs.resolve('rct.config.json', { root })

    // Check for existing config
    if (fs.exists(configPath))
        if (interactive)
            if (!(await confirm('rct.config.json already exists. overwrite?', false)))
                await Bun.stdout.write('aborted.').then(() => process.exit(0))
            else
                await Bun.stderr
                    .write('config exists; use interactive mode to overwrite')
                    .then(() => process.exit(1))

    await Bun.stdout.write('detecting project structure...')
    const derived = deriveFromProject(root)

    let config: RCTConfig
    if (!interactive)
        // Non-interactive: use derived defaults directly
        config = buildConfigFromDerived(derived)
    else {
        // Interactive wizard
        const detectedLangs = Object.keys(derived.lang) as (keyof typeof derived.lang)[]
        if (detectedLangs.length > 0) {
            await Bun.stdout
                .write(`detected languages: ${detectedLangs.join(', ')}`)
                .then(() => confirm('use detected languages?'))
                .then(res =>
                    res ? select('select languages:', detectedLangs, detectedLangs) : []
                )
                .then(chosen =>
                    detectedLangs
                        .filter(lang => !chosen.includes(lang))
                        .forEach(lang => delete derived.lang[lang])
                )

            // Per language: confirm PM and test command
            Object.entries(derived.lang).forEach(async ([name, entry]) => {
                if (!entry.tools) return
                const listing = entry.tools.map(({ name }) => name).join(', ')
                await Bun.stdout.write(`  (${name}) detected tools: ${listing}`)
                await confirm(`use detected tools (${name})?`).then(
                    keep => !keep && (entry.tools = [])
                )
            })

            if (derived.test) {
                await Bun.stdout.write(`detected test command: ${derived.test.command}`)
                await confirm('Use detected test command?').then(
                    keep => !keep && (derived.test = null)
                )
            }
        } else await Bun.stderr.write('no languages detected')

        // Plugins
        const availablePlugins = discoverPlugins(root)
        const plugins = await select('Enable plugins:', availablePlugins, [])

        // Output format
        const formatAnswer = await ask('Output format', 'xml')
        const format = formatAnswer === 'json' ? ('json' as const) : ('xml' as const)

        // Test caching
        let testCache = false
        if (derived.test) testCache = await confirm('Enable test result caching?', false)

        config = buildConfigFromDerived(derived, { plugins, format, testCache })
    }

    await fs.write(configPath, JSON.stringify(config, null, 2))
    await Bun.stdout.write(`wrote ${configPath}`)

    // Apply plugins and desugar to get full config for mergeSettings
    await applyPlugins(validateConfig(config))
        .then(data => desugarFileInjections(data.config))
        .then(cfg =>
            mergeSettings(fs.resolve(['.claude', 'settings.json'], { root }), cfg)
        )
        .then(() => Bun.stdout.write(`updated settings.json`))
}
