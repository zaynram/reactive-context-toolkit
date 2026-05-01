import { definePlugin, CLAUDE_PROJECT_DIR } from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (...segments: string[]) =>
    path.resolve(__dirname, '..', 'public', ...segments)

const context_path = (...segments: string[]): string =>
    path.join(CLAUDE_PROJECT_DIR, '.claude', 'context', ...segments)

const schema_path = (...segments: string[]): string =>
    context_path('schema', ...segments)

export const schema = fs
    .readdirSync(asset('schema'))
    .filter((name) => name.endsWith('.xsd'))
    .sort()
    .map((name) => ({ src: asset('schema', name), dst: schema_path(name) }))

const schemaByName = new Map(
    schema.map((s) => [path.basename(s.dst), s] as const),
)
const dstOf = (name: string): string => {
    const entry = schemaByName.get(name)
    if (!entry) throw new Error(`schema asset not found: ${name}`)
    return entry.dst
}

const entries = [
    {
        alias: 'chores',
        path: context_path('chores.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'chores-schema', path: dstOf('chores.xsd') },
            { alias: 'entry-schema', path: dstOf('common.xsd') },
        ],
    },
    {
        alias: 'plans',
        path: context_path('plans.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'plans-schema', path: dstOf('plans.xsd') },
            { alias: 'entry-schema', path: dstOf('common.xsd') },
        ],
    },
] as const

const directories = [context_path(), schema_path()]
const files = entries
    .map((f) => ({ src: asset(path.basename(f.path)), dst: f.path }))
    .concat(schema)

export default definePlugin({
    name: 'rct-plugin-track-work',
    files: entries,
    setup() {
        directories
            .filter((d) => !fs.existsSync(d))
            .forEach((d) => fs.mkdirSync(d, { recursive: true }))
        files
            .filter(({ dst }) => !fs.existsSync(dst))
            .forEach(({ src, dst }) => fs.copyFileSync(src, dst))
    },
})
