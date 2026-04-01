import path from 'path'

export const normalize = (p: string) => path.normalize(p).replaceAll('\\', '/')

/**
 * Legacy minify: strips markdown table separators, blank lines, heading markers.
 * Used for JSON output minification (register.ts, compose.ts).
 */
export const minify = (text: string) =>
    text
        .split('\n')
        .filter((line) => !/^\|\s*[-:]+/.test(line.trim()))
        .filter((line) => line.trim() !== '')
        .map((line) => line.replace(/^#+\s+/, ''))
        .map((line) => line.trim())
        .join('\n')

/**
 * Condense whitespace in text content for token-efficient injection.
 *
 * @param text - Input text
 * @param separator - Replacement for whitespace runs (default: " ")
 * @param preserveNewlines - If true, only condense horizontal whitespace (spaces/tabs)
 *   and collapse blank-line runs to single newline. If false, all whitespace
 *   including newlines collapsed to separator.
 */
export function condense(
    text: string,
    separator = ' ',
    preserveNewlines = false,
): string {
    if (preserveNewlines) {
        return text
            .split('\n')
            .map((line) => line.replace(/[^\S\n]+/g, separator).trim())
            .join('\n')
            .replace(/\n{2,}/g, '\n')
            .trim()
    }
    return text.replace(/\s+/g, separator).trim()
}

export const entries = <T extends any = unknown>(
    o: Record<string, T>,
): [string, T][] => Object.entries(o)

export function matchesTool(
    matcher: string | undefined,
    toolName: string | undefined,
): boolean {
    if (!matcher) return true
    if (!toolName) return false
    return matcher.split('|').includes(toolName)
}
