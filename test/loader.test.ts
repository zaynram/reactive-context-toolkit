import { describe, test, expect } from "bun:test"
import path from "path"
import { loadConfig } from "../src/config/loader"

const FIXTURES = path.resolve(import.meta.dir, "fixtures")

describe("loadConfig", () => {
  test("returns empty config for empty dir", async () => {
    const config = await loadConfig(path.join(FIXTURES, "empty"))
    expect(config).toEqual({})
  })

  test("parses rct.config.json from fixtures/project", async () => {
    const config = await loadConfig(path.join(FIXTURES, "project"))
    expect(config.globals).toEqual({ format: "xml" })
    expect(config.files).toBeArray()
    expect(config.files!.length).toBe(2)
    expect(config.rules).toBeArray()
    expect(config.injections).toBeArray()
  })

  test("loads rct.config.ts from fixtures/ts-config", async () => {
    const config = await loadConfig(path.join(FIXTURES, "ts-config"))
    expect(config.globals).toEqual({ format: "json" })
    expect(config.files).toEqual([])
  })

  test("prefers .ts over .json when both exist", async () => {
    // Create a temp fixture with both .ts and .json
    const tmpDir = path.join(FIXTURES, "_ts-over-json")
    const { mkdirSync, writeFileSync, rmSync } = await import("fs")
    mkdirSync(tmpDir, { recursive: true })
    try {
      writeFileSync(
        path.join(tmpDir, "rct.config.json"),
        JSON.stringify({ globals: { format: "xml" } }),
      )
      writeFileSync(
        path.join(tmpDir, "rct.config.ts"),
        `export default { globals: { format: "json" } }`,
      )
      const config = await loadConfig(tmpDir)
      // .ts should win over .json
      expect(config.globals?.format).toBe("json")
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
