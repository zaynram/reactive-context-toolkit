import path from "path"
export const normalize = (p: string) => path.normalize(p).replaceAll("\\", "/")
export const minify = (text: string) =>
    text
        .split("\n")
        .filter(line => !/^\|\s*[-:]+/.test(line.trim()))
        .filter(line => line.trim() !== "")
        .map(line => line.replace(/^#+\s+/, ""))
        .map(line => line.trim())
        .join("\n")
export const entries = <T extends any = unknown>(
    o: Record<string, T>,
): [string, T][] => Object.entries(o)
