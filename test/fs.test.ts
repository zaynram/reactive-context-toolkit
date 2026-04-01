import { describe, test, expect, afterEach } from 'bun:test'
import { rmSync, existsSync } from 'fs'
import path from 'path'
import { fs } from '#util/fs'

const TMP = path.resolve(import.meta.dir, '../.tmp-fs-test')

afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe('fs.join', () => {
    test('joins path segments', () => {
        expect(fs.join('/a', 'b', 'c')).toBe(path.join('/a', 'b', 'c'))
    })
})

describe('fs.isAbsolute', () => {
    test('returns true for absolute path', () => {
        expect(fs.isAbsolute('/absolute/path')).toBe(true)
    })

    test('returns false for relative path', () => {
        expect(fs.isAbsolute('relative/path')).toBe(false)
    })
})

describe('fs.readRaw', () => {
    test('reads file content without minification', async () => {
        const file = fs.join(TMP, 'raw.json')
        fs.mkdir(TMP)
        await fs.write(file, '{\n  "key": "value"\n}')
        const content = fs.readRaw(file)
        // Unlike fs.read, readRaw preserves whitespace and newlines
        expect(content).toContain('\n')
        expect(content).toContain('"key"')
    })
})

describe('fs.mkdir', () => {
    test('creates directory and parents', () => {
        const dir = fs.join(TMP, 'a', 'b', 'c')
        fs.mkdir(dir)
        expect(existsSync(dir)).toBe(true)
    })

    test('is idempotent — no error if already exists', () => {
        fs.mkdir(TMP)
        expect(() => fs.mkdir(TMP)).not.toThrow()
    })
})

describe('fs.write', () => {
    test('writes content to file', async () => {
        fs.mkdir(TMP)
        const file = fs.join(TMP, 'out.txt')
        await fs.write(file, 'hello world')
        expect(fs.readRaw(file)).toBe('hello world')
    })

    test('overwrites existing file', async () => {
        fs.mkdir(TMP)
        const file = fs.join(TMP, 'over.txt')
        await fs.write(file, 'first')
        await fs.write(file, 'second')
        expect(fs.readRaw(file)).toBe('second')
    })
})
