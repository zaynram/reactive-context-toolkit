import { fs, normalize } from "#util"
import { existsSync, writeFileSync } from "fs"

const p = process.env.RC_FILEMAP_PATH ?? fs.resolve(".claude", "filemap.json")
if (!existsSync(p)) writeFileSync(p, "{}", { encoding: "utf-8" })

const filemap: Record<string, string[]> = JSON.parse(fs.read(p))

const referenceFiles: Record<string, ReferenceFile> = Object.fromEntries(
    Object.entries(filemap).map(([key, segments]) => {
        const path = fs.resolve(...segments)
        return [
            key,
            {
                path,
                read: () => fs.read(path),
                onmatch: (other, eq, ne) =>
                    normalize(other) === path ? eq() : ne ? ne() : void null,
            } as ReferenceFile,
        ]
    }),
)

const files = {
    ...referenceFiles,
    select: <T extends string>(...names: T[]): ReferenceFile[] =>
        Object.entries(referenceFiles)
            .filter(e => names.includes(e[0] as T))
            .map(e => e[1]),
}

interface ReferenceFile {
    path: string
    read: () => string
    onmatch: <T = void, E = void>(
        other: string,
        eq: () => T,
        ne?: () => E,
    ) => T | E
}

export { files }
export type { ReferenceFile }
export default files
