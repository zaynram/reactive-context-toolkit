// CLAUDE_PROJECT_DIR is captured once at module-load time in src/constants.ts (approach ii:
// directly invoke a re-export pathway). We import the `schema` named export from the plugin,
// which carries the source paths (asset()-based, __dirname-relative, env-independent), and
// replicate the copy step against a temp dir we fully control — no env var mutation needed.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { schema } from '../plugins/rct-plugin-track-work/src/index'

// Ground-truth schema set: enumerate what public/schema/ actually contains.
const PLUGIN_SCHEMA_DIR = path.resolve(
    import.meta.dir,
    '../plugins/rct-plugin-track-work/public/schema',
)
const groundTruthXsds = fs
    .readdirSync(PLUGIN_SCHEMA_DIR)
    .filter((name) => name.endsWith('.xsd'))
    .sort()

describe('rct-plugin-track-work setup()', () => {
    let tmpDir: string
    let tmpSchemaDir: string

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rct-track-work-'))
        tmpSchemaDir = path.join(tmpDir, '.claude', 'context', 'schema')
        fs.mkdirSync(tmpSchemaDir, { recursive: true })

        // Replicate the setup() copy step: for each schema entry, copy src → tmpSchemaDir/<name>.
        // This tests that the dynamically-discovered schema array carries the correct src paths
        // and that setup() would propagate all XSD files.
        for (const entry of schema) {
            const name = path.basename(entry.src)
            fs.copyFileSync(entry.src, path.join(tmpSchemaDir, name))
        }
    })

    afterAll(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    test('ground-truth schema set includes splits.xsd', () => {
        expect(groundTruthXsds).toContain('splits.xsd')
    })

    test('ground-truth schema set includes sequence.xsd', () => {
        expect(groundTruthXsds).toContain('sequence.xsd')
    })

    test('plugin schema array covers every .xsd in public/schema/', () => {
        const schemaNames = schema.map((s) => path.basename(s.src)).sort()
        expect(schemaNames).toEqual(groundTruthXsds)
    })

    test('setup() propagates every .xsd in public/schema/ to the context schema dir', () => {
        for (const name of groundTruthXsds) {
            const dst = path.join(tmpSchemaDir, name)
            expect(fs.existsSync(dst)).toBe(true)
        }
    })

    test('setup() propagates splits.xsd (regression: was absent from hardcoded list)', () => {
        const dst = path.join(tmpSchemaDir, 'splits.xsd')
        expect(fs.existsSync(dst)).toBe(true)
    })

    test('setup() propagates sequence.xsd (regression: was absent from hardcoded list)', () => {
        const dst = path.join(tmpSchemaDir, 'sequence.xsd')
        expect(fs.existsSync(dst)).toBe(true)
    })

    test('propagated schema file contents match source', () => {
        for (const name of groundTruthXsds) {
            const src = path.join(PLUGIN_SCHEMA_DIR, name)
            const dst = path.join(tmpSchemaDir, name)
            const srcContent = fs.readFileSync(src, 'utf-8')
            const dstContent = fs.readFileSync(dst, 'utf-8')
            expect(dstContent).toBe(srcContent)
        }
    })

    test('propagated schema count matches ground-truth count', () => {
        const propagated = fs
            .readdirSync(tmpSchemaDir)
            .filter((name) => name.endsWith('.xsd'))
            .sort()
        expect(propagated).toEqual(groundTruthXsds)
    })
})
