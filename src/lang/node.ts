import type { LangEntry, HookEvent } from '#config/types'
import { getBunScripts, getBunWorkspace } from '#tools/bun'
import { fs, xml, eventMatches } from '#util'

export function evaluateNode(
    entry: LangEntry,
    event: HookEvent,
    cwd: string,
): string[] {
    // Clone entry to avoid mutating the config object
    const resolved = { ...entry }
    const results: string[] = []

    // Auto-discover tsconfig/jsconfig if config is omitted
    if (!resolved.config) {
        if (fs.exists(fs.join(cwd, 'tsconfig.json'))) {
            resolved.config = [
                { name: 'tsconfig', path: 'tsconfig.json', extractPaths: true },
            ]
        } else if (fs.exists(fs.join(cwd, 'jsconfig.json'))) {
            resolved.config = [
                { name: 'jsconfig', path: 'jsconfig.json', extractPaths: true },
            ]
        }
    }

    // Process tools (bun, npm, pnpm)
    if (resolved.tools) {
        for (const tool of resolved.tools) {
            const toolInjectOn = tool.injectOn ?? resolved.injectOn
            if (!eventMatches(event, toolInjectOn)) continue

            switch (tool.name) {
                case 'bun':
                case 'npm':
                case 'pnpm':
                    if (tool.scripts !== false)
                        results.push(getBunScripts(tool, cwd))
                    if (tool.workspace) results.push(getBunWorkspace(tool, cwd))
                    break
            }
        }
    }

    // Process config entries
    if (resolved.config) {
        for (const cfg of resolved.config) {
            const fullPath =
                fs.isAbsolute(cfg.path) ? cfg.path : fs.join(cwd, cfg.path)

            if (cfg.inject) {
                if (!eventMatches(event, resolved.injectOn)) continue
                try {
                    const content = fs.readRaw(fullPath)
                    results.push(
                        xml.wrap('config', {
                            attrs: { name: cfg.name },
                            inner: content,
                        }),
                    )
                } catch {
                    /* skip unreadable */
                }
            }
            if (cfg.extractPaths) {
                const extracted = extractTsconfigPaths(fullPath)
                if (extracted) results.push(extracted)
            }
        }
    }

    return results
}

export function extractTsconfigPaths(configPath: string): string | null {
    if (!fs.exists(configPath)) return null

    try {
        const content = fs.readRaw(configPath)
        const config = JSON.parse(content)
        const paths = config?.compilerOptions?.paths
        if (!paths || typeof paths !== 'object') return null

        const aliases = Object.entries(paths)
            .map(([name, targets]) =>
                xml.inline('path-alias', {
                    name,
                    target: String(
                        Array.isArray(targets) ? targets[0] : targets,
                    ),
                }),
            )
            .join('')

        if (!aliases) return null
        return xml.wrap('path-aliases', { inner: aliases })
    } catch {
        return null
    }
}
