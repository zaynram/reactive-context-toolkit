import { definePlugin, RCTPlugin, FileEntry } from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (filename: string) => path.resolve(__dirname, 'public', filename)

const schema = { alias: 'entry-schema', path: asset('entry-schema.xml') }

const templates = {
    chores: { alias: 'chores-template', path: asset('chores.xml') },
    plans: { alias: 'plans-template', path: asset('plans.xml') },
}

export default definePlugin(
    {
        name: 'rct-plugin-track-work',
        files: [
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
        ],
    },
    function setup(plugin: RCTPlugin) {
        plugin.files.forEach((f: FileEntry) => {
            if (fs.existsSync(f.path)) return
            const { path: src } = templates[f.alias as keyof typeof templates]
            fs.copyFileSync(src, f.path)
        })
    },
)
