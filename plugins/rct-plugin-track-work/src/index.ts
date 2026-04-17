import { definePlugin, type FileEntry } from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (filename: string) =>
    path.resolve(__dirname, '..', 'public', filename)

const schema = {
    chores: { alias: 'chores-schema', path: asset('chores.xsd') },
    plans: { alias: 'plans-schema', path: asset('plans.xsd') },
    common: { alias: 'entry-schema', path: asset('common.xsd') },
}

const templates = {
    chores: { alias: 'chores-template', path: asset('chores.xml') },
    plans: { alias: 'plans-template', path: asset('plans.xml') },
}

const metaFiles = (key: keyof typeof templates) => [
    schema[key],
    templates[key],
    schema.common,
]

const files: FileEntry[] = [
    {
        alias: 'chores',
        path: '.claude/context/chores.xml',
        injectOn: 'SessionStart',
        metaFiles: metaFiles('chores'),
    },
    {
        alias: 'plans',
        path: '.claude/context/plans.xml',
        injectOn: 'SessionStart',
        metaFiles: metaFiles('plans'),
    },
]

export default definePlugin({
    name: 'rct-plugin-track-work',
    files,
    setup() {
        for (const f of files) {
            if (fs.existsSync(f.path)) continue
            const key: keyof typeof templates = f.alias
            if (key in templates) {
                const dir = path.dirname(f.path)
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                fs.copyFileSync(templates[key].path, f.path)
            }
        }
    },
})
