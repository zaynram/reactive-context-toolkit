import { definePlugin, type FileEntry, type MetaFileEntry } from 'reactive-context-toolkit'
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

const files: FileEntry[] = [
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
]

export default definePlugin({
    name: 'rct-plugin-issue-scope',
    files,
    setup() {
        for (const f of files) {
            if (fs.existsSync(f.path)) continue
            const template = f.metaFiles?.find((mf: MetaFileEntry) =>
                mf.alias.includes('template'),
            )
            if (!template) continue
            const dir = path.dirname(f.path)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.copyFileSync(template.path, f.path)
        }
    },
})
