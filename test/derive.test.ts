import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { deriveFromProject } from '../src/config/derive'

let tmp: string

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rct-derive-'))
})

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
})

const writePkg = (obj: Record<string, unknown>) =>
    writeFileSync(join(tmp, 'package.json'), JSON.stringify(obj))

const touch = (name: string) => writeFileSync(join(tmp, name), '')

describe('deriveFromProject', () => {
    test('detects node from package.json with name+version', () => {
        writePkg({ name: 'my-app', version: '1.0.0' })
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeDefined()
    })

    test('detects node from package.json with name+private', () => {
        writePkg({ name: 'my-app', private: true })
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeDefined()
    })

    test('detects node from package.json with name+scripts', () => {
        writePkg({ name: 'my-app', scripts: { build: 'tsc' } })
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeDefined()
    })

    test('does NOT detect node from package.json with only dependencies', () => {
        writePkg({ dependencies: { lodash: '^4.0.0' } })
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeUndefined()
    })

    test('detects node from tsconfig.json alone', () => {
        touch('tsconfig.json')
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeDefined()
    })

    test('detects multi-lang: package.json + Cargo.toml', () => {
        writePkg({ name: 'hybrid', version: '0.1.0' })
        touch('Cargo.toml')
        const result = deriveFromProject(tmp)
        expect(result.lang.node).toBeDefined()
        expect(result.lang.rust).toBeDefined()
        expect(result.lang.rust!.tools).toEqual([{ name: 'cargo' }])
    })

    test('derives test command for bun project', () => {
        writePkg({
            name: 'app',
            version: '1.0.0',
            scripts: { test: 'bun test' },
        })
        touch('bun.lock')
        const result = deriveFromProject(tmp)
        expect(result.test).not.toBeNull()
        expect(result.test!.command).toBe('bun test')
        expect(result.test!.injectOn).toBe('SessionStart')
    })

    test('detects bun from bun.lock', () => {
        writePkg({ name: 'app', version: '1.0.0' })
        touch('bun.lock')
        const result = deriveFromProject(tmp)
        expect(result.lang.node!.tools![0].name).toBe('bun')
    })

    test('detects pnpm from pnpm-lock.yaml', () => {
        writePkg({ name: 'app', version: '1.0.0' })
        touch('pnpm-lock.yaml')
        const result = deriveFromProject(tmp)
        expect(result.lang.node!.tools![0].name).toBe('pnpm')
    })

    test('detects npm from package-lock.json', () => {
        writePkg({ name: 'app', version: '1.0.0' })
        touch('package-lock.json')
        const result = deriveFromProject(tmp)
        expect(result.lang.node!.tools![0].name).toBe('npm')
    })

    test('empty directory yields empty lang and null test', () => {
        const result = deriveFromProject(tmp)
        expect(result.lang).toEqual({})
        expect(result.test).toBeNull()
        expect(result.files).toEqual([])
        expect(result.globals).toEqual({})
    })

    test('auto-derives tsconfig config entry when tsconfig.json exists', () => {
        writePkg({ name: 'app', version: '1.0.0' })
        touch('tsconfig.json')
        const result = deriveFromProject(tmp)
        const configs = result.lang.node!.config
        expect(configs).toBeDefined()
        expect(configs).toHaveLength(1)
        expect(configs![0]).toEqual({
            name: 'tsconfig',
            path: 'tsconfig.json',
            extractPaths: true,
        })
    })
})
