import { describe, expect, test } from "bun:test"
import pluginRegistry from "../src/plugin/index"
import type { RCTPlugin } from "../src/plugin/types"

describe("plugin registry", () => {
    test("contains track-work and issue-scope", () => {
        expect("track-work" in pluginRegistry).toBe(true)
        expect("issue-scope" in pluginRegistry).toBe(true)
    })

    test("each plugin has a name matching its registry key", () => {
        for (const [key, plugin] of Object.entries(pluginRegistry)) {
            expect(plugin.name).toBe(key)
        }
    })
})

describe("track-work plugin", () => {
    const plugin: RCTPlugin = pluginRegistry["track-work"]

    test("has name 'track-work'", () => {
        expect(plugin.name).toBe("track-work")
    })

    test("contributes chores and plans files", () => {
        const aliases = (plugin.files ?? []).map(f => f.alias)
        expect(aliases).toContain("chores")
        expect(aliases).toContain("plans")
    })

    test("chores file has injectOn: SessionStart", () => {
        const chores = (plugin.files ?? []).find(f => f.alias === "chores")
        expect(chores?.injectOn).toBe("SessionStart")
    })

    test("chores and plans have entry-schema metaFile", () => {
        for (const file of plugin.files ?? []) {
            expect(file.metaFiles?.some(m => m.alias === "entry-schema")).toBe(true)
        }
    })
})

describe("issue-scope plugin", () => {
    const plugin: RCTPlugin = pluginRegistry["issue-scope"]

    test("has name 'issue-scope'", () => {
        expect(plugin.name).toBe("issue-scope")
    })

    test("contributes scope and candidates files", () => {
        const aliases = (plugin.files ?? []).map(f => f.alias)
        expect(aliases).toContain("scope")
        expect(aliases).toContain("candidates")
    })

    test("scope file has injectOn: SessionStart", () => {
        const scope = (plugin.files ?? []).find(f => f.alias === "scope")
        expect(scope?.injectOn).toBe("SessionStart")
    })

    test("scope file has staleCheck configured", () => {
        const scope = (plugin.files ?? []).find(f => f.alias === "scope")
        expect(scope?.staleCheck).toBeDefined()
        expect(scope?.staleCheck?.dateTag).toBe("date")
    })
})
