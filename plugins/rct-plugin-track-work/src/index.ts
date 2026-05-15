import path from 'path'
import fs from 'fs'
import { validateXMLWithXSD } from 'validate-with-xmllint'
import {
    definePlugin,
    evaluateMatch,
    CLAUDE_PROJECT_DIR,
    type FileEntry,
    type Match,
    type PluginHookInput,
} from 'rct'

const resolveBundled = (...segments: string[]) =>
    path.resolve(__dirname, '..', 'public', ...segments)

const resolveContextPath = (...segments: string[]): string =>
    path.join(CLAUDE_PROJECT_DIR, '.claude', 'context', ...segments)

const resolveSchemaPath = (...segments: string[]): string =>
    resolveContextPath('schema', ...segments)

export const schema = fs
    .readdirSync(resolveBundled('schema'))
    .filter((name) => name.endsWith('.xsd'))
    .sort()
    .map((name) => ({
        src: resolveBundled('schema', name),
        dst: resolveSchemaPath(name),
    }))

const schemaByName = new Map(
    schema.map((s) => [path.basename(s.dst), s] as const),
)
const lookupSchemaPath = (name: string): string => {
    const entry = schemaByName.get(name)
    if (!entry) throw new Error(`schema asset not found: ${name}`)
    return entry.dst
}

const files: FileEntry[] = [
    {
        alias: 'chores',
        path: resolveContextPath('chores.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'chores-schema', path: lookupSchemaPath('chores.xsd') },
            { alias: 'entry-schema', path: lookupSchemaPath('common.xsd') },
        ],
    },
    {
        alias: 'plans',
        path: resolveContextPath('plans.xml'),
        injectOn: 'SessionStart',
        metaFiles: [
            { alias: 'plans-schema', path: lookupSchemaPath('plans.xsd') },
            { alias: 'entry-schema', path: lookupSchemaPath('common.xsd') },
        ],
    },
] as const

const containers = [resolveContextPath(), resolveSchemaPath()]
const leaves = files
    .map((f) => ({ src: resolveBundled(path.basename(f.path)), dst: f.path }))
    .concat(schema)

const conditions: Record<'context' | 'trigger', Match> = {
    context: [
        { target: 'tool_name', operator: 'regex', pattern: /Edit|Write/ },
        { target: 'file_path', operator: 'equals', pattern: files },
    ],
    trigger: [
        { target: 'tool_name', operator: 'equals', pattern: 'Bash' },
        {
            target: 'command',
            operator: 'regex',
            pattern: /xmllint(.*)(chores|plans).xml/s,
        },
    ],
}
interface ContextMatch {
    name: string
    validate(): Promise<void>
}
const bufferFromPath = async (path: string) =>
    Buffer.from(await Bun.file(path).arrayBuffer())

const getContextMatch = (input: PluginHookInput): ContextMatch | undefined => {
    if (!evaluateMatch(conditions.context, input.payload)) return undefined
    if (!Bun.which('xmllint'))
        throw Error('xmllint is either not installed or not on PATH')
    const fp = input.payload!.file_path as string
    const name = path.basename(fp)
    return {
        name,
        async validate() {
            return validateXMLWithXSD(
                await bufferFromPath(fp),
                await bufferFromPath(lookupSchemaPath(this.name)),
            )
        },
    }
}

export default definePlugin({
    name: 'rct-plugin-track-work',
    files,
    setup() {
        containers
            .filter((d) => !fs.existsSync(d))
            .forEach((d) => fs.mkdirSync(d, { recursive: true }))
        leaves
            .filter(({ dst }) => !fs.existsSync(dst))
            .forEach(({ src, dst }) => fs.copyFileSync(src, dst))
    },
    async context(...[, input]) {
        const match = getContextMatch(input)
        return match
            ?.validate()
            .then(() => `${match.name} passed XSD schema validation`)
            .catch((e) => `${match.name} has XSD validation errors: ${e}`)
    },
    contextOn: 'PostToolUse',
    contextFrequency: 'always',
    trigger(event, input) {
        switch (event) {
            case 'PreToolUse':
                if (!evaluateMatch(conditions.trigger, input.payload))
                    return undefined
                const name = path.basename(input.payload!.file_path as string)
                return {
                    action: 'block',
                    message: `${name} XSD validation output is auto-injected on Write|Edit tool uses`,
                }
        }
    },
})
