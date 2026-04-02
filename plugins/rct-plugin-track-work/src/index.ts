import { definePlugin, type FileEntry } from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (filename: string) => path.resolve(__dirname, 'public', filename)

const schema = { alias: 'entry-schema', path: asset('entry-schema.xml') }

const templates = {
    chores: { alias: 'chores-template', path: asset('chores.xml') },
    plans: { alias: 'plans-template', path: asset('plans.xml') },
}

const files: FileEntry[] = [
    {
        alias: 'chores',
        path: '.claude/context/chores.xml',
        injectOn: 'SessionStart',
        metaFiles: [schema, templates.chores],
    },
    {
        alias: 'plans',
        path: '.claude/context/plans.xml',
        injectOn: 'SessionStart',
        metaFiles: [schema, templates.plans],
    },
]

export default definePlugin({
    name: 'rct-plugin-track-work',
    files,
    setup() {
        for (const f of files) {
            if (fs.existsSync(f.path)) continue
            const key = f.alias as keyof typeof templates
            if (!(key in templates)) continue
            const dir = path.dirname(f.path)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(templates[key].path, f.path)
        }
    },
})
