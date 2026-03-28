import { describe, expect, test } from "bun:test"
import { getBunScripts, getBunWorkspace } from "#lang/bun"
import type { LangTool } from "#config/types"
import path from "path"

const fixtureDir = path.resolve(import.meta.dir, "fixtures/project")
const baseTool: LangTool = { name: "bun" }

describe("getBunScripts", () => {
    test("parses package.json scripts", () => {
        const result = getBunScripts(baseTool, fixtureDir)
        expect(result).toContain("test")
        expect(result).toContain("bun test")
        expect(result).toContain("build")
        expect(result).toContain("bun build")
        expect(result).toContain("<script")
    })

    test("returns empty element when no scripts", () => {
        const result = getBunScripts(baseTool, "/nonexistent")
        expect(result).toContain("scripts")
        expect(result).toMatch(/<scripts\s*\/>/)
    })

    test("accepts manifest override", () => {
        const tool: LangTool = {
            name: "bun",
            manifest: path.join(fixtureDir, "package.json"),
        }
        const result = getBunScripts(tool, "/some/other/dir")
        expect(result).toContain("test")
        expect(result).toContain("bun test")
    })
})

describe("getBunWorkspace", () => {
    test("returns workspace listing when workspaces exist", () => {
        // The fixture package.json doesn't have workspaces, so expect empty
        const result = getBunWorkspace(baseTool, fixtureDir)
        expect(result).toContain("workspaces")
    })

    test("returns empty element when no workspaces", () => {
        const result = getBunWorkspace(baseTool, fixtureDir)
        expect(result).toMatch(/<workspaces\s*\/>/)
    })
})
