import type { LangEntry, HookEvent } from '#config/types'
import { getPixiTasks, getPixiEnvironment } from '#tools/pixi'
import { eventMatches } from '#util'

export function evaluatePython(
    entry: LangEntry,
    event: HookEvent,
    cwd: string,
): string[] {
    const results: string[] = []

    if (entry.tools) {
        for (const tool of entry.tools) {
            const toolInjectOn = tool.injectOn ?? entry.injectOn
            if (!eventMatches(event, toolInjectOn)) continue

            switch (tool.name) {
                case 'pixi':
                    if (tool.tasks !== false)
                        results.push(getPixiTasks(tool, cwd))
                    if (tool.environment)
                        results.push(getPixiEnvironment(tool, cwd))
                    break
                case 'uv':
                case 'pip':
                case 'pipx':
                    break
            }
        }
    }

    return results
}
