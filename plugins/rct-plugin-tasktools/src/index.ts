/**
 * rct-plugin-tasktools
 *
 * For projects using tasktools:
 * - Warns on raw git/cargo commands (should use pixi tasks instead)
 * - Injects tasktools command reference on direct tasktools invocation (once per session)
 * - Deduplicates with pixi task injection when both are active
 * - Checks tasktools presence freshly each invocation (handles install/uninstall)
 */
import {
    definePlugin,
    type PluginHookInput,
    type HookEvent,
} from 'reactive-context-toolkit'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const cwd = () => process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

// Track injection state to avoid repetitive context
let tasktoolsReferenceInjected = false
let lastDetectionTime = 0
let lastDetectionResult = false
const DETECTION_TTL_MS = 30_000 // re-check presence every 30s

function hasTasktools(): boolean {
    const now = Date.now()
    if (now - lastDetectionTime < DETECTION_TTL_MS) return lastDetectionResult
    lastDetectionTime = now
    lastDetectionResult =
        existsSync(resolve(cwd(), 'dev/tasktools'))
        || !!process.env.TASKTOOLS_ROOT
    return lastDetectionResult
}

function hasPixiTaskInjection(): boolean {
    try {
        const configPath = resolve(cwd(), 'rct.config.json')
        if (!existsSync(configPath)) return false
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        const tools = config?.lang?.python?.tools ?? []
        return tools.some(
            (t: { name: string; tasks?: boolean }) =>
                t.name === 'pixi' && t.tasks === true,
        )
    } catch {
        return false
    }
}

function getNodeScripts(): Record<string, string> | null {
    try {
        const pkgPath = resolve(cwd(), 'package.json')
        if (!existsSync(pkgPath)) return null
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        return pkg.scripts && Object.keys(pkg.scripts).length > 0
            ? pkg.scripts
            : null
    } catch {
        return null
    }
}

const TASKTOOLS_COMMANDS = [
    'pixi run push <msg>       — git commit + push parent',
    'pixi run push-sub <s> <m> — git commit + push one submodule',
    'pixi run push-all <msg>   — submodules first, then parent',
    'pixi run release [bump]   — version bump + tag + push',
    'pixi run status           — git status across all repos',
    'pixi run test [pattern]   — cargo test across packages',
    'pixi run clippy [pattern] — cargo clippy across packages',
    'pixi run check [pattern]  — test + clippy (full validation)',
].join('\n  ')

export default definePlugin({
    name: 'rct-plugin-tasktools',

    // Warn on raw git/cargo — should use pixi tasks
    trigger(event: HookEvent, input: PluginHookInput) {
        if (event !== 'PreToolUse' || input.toolName !== 'Bash') return undefined
        if (!hasTasktools()) return undefined

        const cmd = String(input.payload?.command ?? '')

        if (/^git\s+(commit|push|tag)\b/.test(cmd)) {
            return {
                action: 'warn' as const,
                message:
                    'This project uses tasktools. Use pixi task wrappers:\n  '
                    + TASKTOOLS_COMMANDS,
            }
        }

        if (/^cargo\s+(test|clippy|check|build)\b/.test(cmd)) {
            return {
                action: 'warn' as const,
                message:
                    'This project uses tasktools for cargo workflows.\n'
                    + '  pixi run test [pattern]   — across packages\n'
                    + '  pixi run clippy [pattern] — across packages\n'
                    + '  pixi run check [pattern]  — test + clippy',
            }
        }

        return undefined
    },

    contextOn: ['SessionStart', 'PreToolUse'],

    context(event: HookEvent, input: PluginHookInput) {
        if (!hasTasktools()) return undefined

        // SessionStart: availability notice + node scripts
        if (event === 'SessionStart') {
            tasktoolsReferenceInjected = false // reset for new session
            const parts: string[] = ['<tasktools>']

            const scripts = getNodeScripts()
            if (scripts) {
                parts.push('<node-scripts>')
                for (const [name, cmd] of Object.entries(scripts)) {
                    parts.push(`  <script name="${name}">${cmd}</script>`)
                }
                parts.push('</node-scripts>')
            }

            if (!hasPixiTaskInjection()) {
                parts.push('<commands>', '  ' + TASKTOOLS_COMMANDS, '</commands>')
            } else {
                parts.push(
                    '<guidance>Pixi tasks active. Use pixi run &lt;task&gt; for all repo operations.</guidance>',
                )
            }

            parts.push('</tasktools>')
            return parts.join('\n')
        }

        // PreToolUse: inject command reference on direct tasktools invoke (once only)
        if (event === 'PreToolUse' && input.toolName === 'Bash') {
            if (tasktoolsReferenceInjected) return undefined // already shown this session

            const cmd = String(input.payload?.command ?? '')
            if (/^tasktools\s/.test(cmd)) {
                tasktoolsReferenceInjected = true
                return (
                    '<tasktools-reference injected-once="true">\n'
                    + 'Direct tasktools invocation detected. Available pixi wrappers:\n  '
                    + TASKTOOLS_COMMANDS
                    + '\n</tasktools-reference>'
                )
            }
        }

        return undefined
    },
})
