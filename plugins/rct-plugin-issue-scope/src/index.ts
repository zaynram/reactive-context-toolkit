import {
    definePlugin,
    RCTPlugin,
    FileEntry,
    MetaFileEntry,
} from 'reactive-context-toolkit'
import path from 'path'
import fs from 'fs'

const asset = (filename: string) => path.resolve(__dirname, 'public', filename)

const scopeFiles = [
    { alias: 'scope-schema', path: asset('scope-schema.xml') },
    { alias: 'scope-template', path: asset('scope.xml') },
]
const issuesFiles = [
    { alias: 'issues-schema', path: asset('issues-schema.xml') },
    { alias: 'issues-template', path: asset('issues.xml') },
]

export default definePlugin(
    {
        name: 'rct-plugin-issue-scope',
        files: [
            {
                alias: 'scope',
                path: '.claude/context/scope.xml',
                metaFiles: scopeFiles,
                injectOn: 'SessionStart',
                staleCheck: { dateTag: 'date', wrapTag: 'stale-scope' },
            },
            {
                alias: 'candidates',
                path: '.claude/context/issues.xml',
                metaFiles: issuesFiles,
            },
        ],
    },
    function setup(plugin: RCTPlugin) {
        plugin.files.forEach((f: FileEntry) => {
            if (fs.existsSync(f.path)) return
            const template = f.metaFiles.find((mf: MetaFileEntry) =>
                mf.alias.includes('template'),
            )
            fs.copyFileSync(template.path, f.path)
        })
    },
)
