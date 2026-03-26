import fs from "./fs.mjs"
import { normalize } from "./util.mjs"

const segmentsMap = {
    chores: ["dev", "chores.xml"],
    plans: [".claude", "plans", "index.xml"],
    issues: ["dev", "issues.xml"],
    scope: ["dev", "scope.xml"],
}

/** @type {Record<ReferenceFileName, ReferenceFile>} */
const referenceFiles = Object.fromEntries(
    Object.entries(segmentsMap).map(([key, segments]) => {
        const path = fs.resolve(...segments)
        return [
            key,
            {
                path,
                read: () => fs.read(path),
                onmatch: (other, eq, ne) =>
                    normalize(other) === path ? eq() : ne ? ne() : void null,
            },
        ]
    }),
)

export default {
    ...referenceFiles,
    /**
     * @type {<T extends ReferenceFileName>(...names: T[]) => ReferenceFile[]}
     */
    select: (...names) =>
        Object.entries(referenceFiles)
            .filter(e => names.includes(e[0]))
            .map(e => e[1]),
}

/**
 * @typedef ReferenceFile
 * @prop {string} path
 * @prop {() => string} read
 * @prop {<T = void, E = void>(
 *   other: string,
 *   eq: () => T,
 *   ne?: () => E
 * ) => T | E} onmatch
 */

/**
 * @typedef {keyof typeof segmentsMap} ReferenceFileName
 */
