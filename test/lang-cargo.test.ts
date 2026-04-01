import { describe, expect, test } from 'bun:test'
import { getCargoInfo } from '#lang/cargo'
import type { LangTool } from '#config/types'
import path from 'path'

const fixtureDir = path.resolve(import.meta.dir, 'fixtures/project')
const baseTool: LangTool = { name: 'cargo' }

describe('getCargoInfo', () => {
    test('extracts package info from Cargo.toml fixture', () => {
        const result = getCargoInfo(baseTool, fixtureDir)
        expect(result).toContain('test-crate')
        expect(result).toContain('0.1.0')
        expect(result).toContain('<cargo')
    })

    test('returns empty when no Cargo.toml', () => {
        const result = getCargoInfo(baseTool, '/nonexistent')
        expect(result).toMatch(/<cargo\s*\/>/)
    })

    test('accepts manifest override from tool config', () => {
        const tool: LangTool = {
            name: 'cargo',
            manifest: path.join(fixtureDir, 'Cargo.toml'),
        }
        const result = getCargoInfo(tool, '/some/other/dir')
        expect(result).toContain('test-crate')
        expect(result).toContain('0.1.0')
    })
})
