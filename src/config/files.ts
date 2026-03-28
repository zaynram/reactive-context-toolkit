import { fs, normalize } from "#util"
import { config } from "./index"

const referenceFiles: Record<string, ReferenceFile> = Object.fromEntries(
    Object.entries(config.files ?? {}).map(([key, segments]) => {
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
