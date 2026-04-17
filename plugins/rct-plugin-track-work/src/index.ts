import {
    definePlugin,
    FileEntry,
    CLAUDE_PROJECT_DIR,
} from 'reactive-context-toolkit'
import path, { basename } from 'path'
import fs from 'fs'

const asset = (filename: string) =>
    path.resolve(__dirname, '..', 'public', filename)

const context_path = (filename?: string): string =>
    path.join(
        ...[CLAUDE_PROJECT_DIR, '.claude', 'context', filename].filter(Boolean),
    )

const schema_names = [
    'chores.xsd',
    'plans.xsd',
    'common.xsd',
    'simple-types.xsd',
] as const

const schema = schema_names.map(asset)
const mapped_schema = schema.map((src, idx) => ({
    src,
    dst: context_path(schema_names[idx]),
}))

const [chores_schema, plans_schema, entry_schema] = schema
const files = [
    {
        alias: 'chores',
        path: context_path('chores.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'chores-schema', path: chores_schema },
            { alias: 'entry-schema', path: entry_schema },
        ],
    },
    {
        alias: 'plans',
        path: context_path('plans.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'plans-schema', path: plans_schema },
            { alias: 'entry-schema', path: entry_schema },
        ],
    },
] as const
const mapped_files = files
    .map((f) => ({ src: asset(path.basename(f.path)), dst: f.path }))
    .concat(mapped_schema)

export default definePlugin({
    name: 'rct-plugin-track-work',
    files,
    setup() {
        const dir = context_path()
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        mapped_files
            .filter(({ dst }) => !fs.existsSync(dst))
            .forEach(({ src, dst }) => fs.copyFileSync(src, dst))
    },
})
