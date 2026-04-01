import type { LangConfig, HookEvent } from '#config/types'
import { evaluateNode } from './node'
import { evaluatePython } from './python'
import { evaluateRust } from './rust'

export { extractTsconfigPaths } from './node'

export function evaluateLang(
    lang: LangConfig,
    event: HookEvent,
    cwd: string,
): string[] {
    const results: string[] = []

    if (lang.node) results.push(...evaluateNode(lang.node, event, cwd))
    if (lang.python) results.push(...evaluatePython(lang.python, event, cwd))
    if (lang.rust) results.push(...evaluateRust(lang.rust, event, cwd))

    return results
}
