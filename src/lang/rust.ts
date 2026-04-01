import type { LangEntry, HookEvent } from '#config/types'
import { getCargoInfo } from '#tools/cargo'
import { eventMatches } from '#util'

export function evaluateRust(
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
                case 'cargo':
                    results.push(getCargoInfo(tool, cwd))
                    break
                case 'cargo-binstall':
                case 'rustup':
                    break
            }
        }
    }

    return results
}
