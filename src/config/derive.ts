import type {
    LangConfig,
    LangEntry,
    LangTool,
    TestConfig,
    FileEntry,
    GlobalsConfig,
} from './types'
import { fs } from '#util/fs'

type NodePackageManager = 'bun' | 'pnpm' | 'npm'

export interface DerivedConfig {
    lang: LangConfig
    test: TestConfig | null
    files: FileEntry[]
    globals: Partial<GlobalsConfig>
}

export function deriveFromProject(root: string): DerivedConfig {
    const lang: LangConfig = {}
    const files: FileEntry[] = []
    const testCmds: string[] = []

    const at = (name: string) => fs.resolve(name, { root })
    const has = (name: string) => fs.exists(at(name))

    // Read package.json once if it exists
    const hasPkg = has('package.json')
    let pkg: Record<string, any> | null = null
    if (hasPkg) {
        try {
            pkg = JSON.parse(fs.readRaw(at('package.json')))
        } catch {
            pkg = null
        }
    }

    // Detect Node (relaxed gate per plan-review F6)
    const hasTsconfig = has('tsconfig.json')
    const hasJsconfig = has('jsconfig.json')
    const isNodeProject =
        hasTsconfig
        || hasJsconfig
        || (pkg?.name && (pkg?.version || pkg?.private || pkg?.scripts))

    if (isNodeProject) {
        // Detect package manager from lockfile
        let pmName: NodePackageManager | undefined
        if (has('bun.lock') || has('bun.lockb')) pmName = 'bun'
        else if (has('pnpm-lock.yaml')) pmName = 'pnpm'
        else if (has('package-lock.json')) pmName = 'npm'

        const tool: LangTool | undefined =
            pmName ? { name: pmName, scripts: true } : undefined

        // Get test command from package.json scripts
        if (tool && pkg?.scripts?.test) {
            testCmds.push(pkg.scripts.test)
        }

        const entry: LangEntry = { tools: tool ? [tool] : [] }

        // Auto-detect config files
        if (hasTsconfig) {
            entry.config = [
                { name: 'tsconfig', path: 'tsconfig.json', extractPaths: true },
            ]
        } else if (hasJsconfig) {
            entry.config = [
                { name: 'jsconfig', path: 'jsconfig.json', extractPaths: true },
            ]
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

    // Build test config
    const test: TestConfig | null =
        testCmds.length > 0 ?
            { command: testCmds.join(' && '), injectOn: 'SessionStart' }
        :   null

    return { lang, test, files, globals: {} }
}
