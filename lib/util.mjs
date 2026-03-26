import path from "path"
/** @type {(p: string) => string} */
export const normalize = p => path.normalize(p).replaceAll("\\", "/")
/** @type {(text: string) => string} */
export const minify = text =>
    text
        .split("\n")
        .filter(line => !/^\|\s*[-:]+/.test(line.trim()))
        .filter(line => line.trim() !== "")
        .map(line => line.replace(/^#+\s+/, ""))
        .map(line => line.trim())
        .join("\n")
/** @type {(msg?: string) => void} */
export const block = msg => {
    if (msg) console.log(msg)
    process.exit(2)
}
