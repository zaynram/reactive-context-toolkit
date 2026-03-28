import { describe, expect, test } from "bun:test"
import { getPixiTasks, getPixiEnvironment } from "#lang/pixi"
import type { LangTool } from "#config/types"

const baseTool: LangTool = { name: "pixi" }

describe("getPixiTasks", () => {
    test("returns fallback XML when pixi not available", () => {
        const result = getPixiTasks(baseTool, "/nonexistent")
        expect(result).toContain("pixi")
        expect(typeof result).toBe("string")
        // Should return a valid XML-like fallback, not throw
        expect(result).toContain("unavailable")
    })

    test("accepts manifest override from tool config", () => {
        const tool: LangTool = { name: "pixi", manifest: "/custom/pixi.toml" }
        const result = getPixiTasks(tool, "/nonexistent")
        expect(typeof result).toBe("string")
        expect(result).toContain("pixi")
    })
})

describe("getPixiEnvironment", () => {
    test("returns fallback when pixi not available", () => {
        const result = getPixiEnvironment(baseTool, "/nonexistent")
        expect(result).toContain("pixi")
        expect(typeof result).toBe("string")
        expect(result).toContain("unavailable")
    })

    test("accepts manifest override from tool config", () => {
        const tool: LangTool = { name: "pixi", manifest: "/custom/pixi.toml" }
        const result = getPixiEnvironment(tool, "/nonexistent")
        expect(typeof result).toBe("string")
    })
})
