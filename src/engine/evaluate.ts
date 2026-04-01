import type { MatchCondition, Match, MatchTarget } from '../config/types'

/**
 * Convert a simple glob pattern to a regex.
 * Supports *, **, and ? wildcards.
 */
function globToRegex(glob: string): RegExp {
    let regex = ''
    let i = 0
    while (i < glob.length) {
        const ch = glob[i]
        if (ch === '*') {
            if (glob[i + 1] === '*') {
                // ** matches anything including path separators
                if (glob[i + 2] === '/') {
                    regex += '(?:.*/)?'
                    i += 3
                } else {
                    regex += '.*'
                    i += 2
                }
            } else {
                // * matches anything except path separators
                regex += '[^/]*'
                i++
            }
        } else if (ch === '?') {
            regex += '[^/]'
            i++
        } else if ('.+^${}()|[]\\'.includes(ch!)) {
            regex += '\\' + ch
            i++
        } else {
            regex += ch
            i++
        }
    }
    return new RegExp('^' + regex + '$')
}

function getPatternStrings(pattern: MatchCondition['pattern']): string[] {
    if (typeof pattern === 'string') return [pattern]
    return pattern.map((p) => (typeof p === 'string' ? p : p.path))
}

function matchSingle(
    operator: string,
    pattern: string,
    value: string,
): boolean {
    switch (operator) {
        case 'regex':
            return new RegExp(pattern).test(value)
        case 'contains':
            return value.includes(pattern)
        case 'not_contains':
            return !value.includes(pattern)
        case 'equals':
            return value === pattern
        case 'starts_with':
            return value.startsWith(pattern)
        case 'ends_with':
            return value.endsWith(pattern)
        case 'glob':
            return globToRegex(pattern).test(value)
        default:
            return false
    }
}

export function evaluateCondition(
    condition: MatchCondition,
    value: string,
): boolean {
    const operator = condition.operator ?? 'regex'
    const patterns = getPatternStrings(condition.pattern)

    // Any pattern matching = true (OR logic across patterns)
    return patterns.some((p) => matchSingle(operator, p, value))
}

export function extractTargetValue(
    target: MatchTarget,
    payload: Record<string, unknown>,
): string {
    // user_prompt comes from the "prompt" field directly on payload
    if (target === 'user_prompt') {
        return (payload.prompt as string) ?? ''
    }

    // tool_name and error come directly from payload
    if (target === 'tool_name') {
        return (payload.tool_name as string) ?? ''
    }
    if (target === 'error') {
        return (payload.error as string) ?? ''
    }

    // Everything else comes from tool_input
    const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>
    return (toolInput[target] as string) ?? ''
}

export function evaluateMatch(
    match: Match,
    payload: Record<string, unknown>,
): boolean {
    const conditions = Array.isArray(match) ? match : [match]

    // AND logic: all conditions must be true
    return conditions.every((cond) => {
        const value = extractTargetValue(cond.target, payload)
        return evaluateCondition(cond, value)
    })
}
