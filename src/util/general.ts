import path from "path"

export const normalize = (p: string) => path.normalize(p).replaceAll("\\", "/")

/**
 * Legacy minify: strips markdown table separators, blank lines, heading markers.
 * Used for JSON output minification (register.ts, compose.ts).
 */
export const minify = (text: string) =>
    text
        .split("\n")
        .filter(line => !/^\|\s*[-:]+/.test(line.trim()))
        .filter(line => line.trim() !== "")
        .map(line => line.replace(/^#+\s+/, ""))
        .map(line => line.trim())
        .join("\n")

/**
 * Condense whitespace in text content for token-efficient injection.
 * Collapses all whitespace runs (spaces, tabs, newlines) to a single separator.
 * Preserves content within XML tags but condenses whitespace between/around them.
 */
export function condense(text: string, separator = " "): string {
    return text.replace(/\s+/g, separator).trim()
}

export const entries = <T extends any = unknown>(
    o: Record<string, T>,
): [string, T][] => Object.entries(o)
