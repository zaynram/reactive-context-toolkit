import { definePlugin, CLAUDE_PROJECT_DIR } from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (...segments: string[]) =>
    path.resolve(__dirname, '..', 'public', ...segments)

const context_path = (...segments: string[]): string =>
    path.join(CLAUDE_PROJECT_DIR, '.claude', 'context', ...segments)

const schema_path = (...segments: string[]): string =>
    context_path('schema', ...segments)

const schema = [
    'chores.xsd',
    'plans.xsd',
    'common.xsd',
    'simple-types.xsd',
].map((name) => ({ src: asset('schema', name), dst: schema_path(name) }))

const entries = [
    {
        alias: 'chores',
        path: context_path('chores.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'chores-schema', path: schema[0].dst },
            { alias: 'entry-schema', path: schema[2].dst },
        ],
    },
    {
        alias: 'plans',
        path: context_path('plans.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'plans-schema', path: schema[1].dst },
            { alias: 'entry-schema', path: schema[2].dst },
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
