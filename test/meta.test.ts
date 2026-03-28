import { describe, test, expect } from "bun:test"
import { generateMeta } from "../src/engine/meta"
import type { RCTConfig, MetaConfig, GlobalsConfig } from "../src/config/types"
import type { FileRegistry, ReferenceFile } from "../src/config/files"

function makeRef(alias: string, filePath: string, brief?: string): ReferenceFile {
  return {
    alias,
    path: filePath,
    brief,
    read: () => `<${alias}>content</${alias}>`,
  }
}

function makeRegistry(refs: ReferenceFile[]): FileRegistry {
  const map = new Map<string, ReferenceFile>()
  for (const r of refs) map.set(r.alias, r)

  return {
    get(alias: string) {
      return map.get(alias)
    },
    getRef(ref: string) {
      let useBrief = false
      let key = ref
      if (key.endsWith("~brief")) {
        useBrief = true
        key = key.slice(0, -6)
      }
      const file = map.get(key)
      return file ? { file, useBrief } : undefined
    },
    select(...aliases: string[]) {
      return aliases.map(a => map.get(a)).filter((f): f is ReferenceFile => !!f)
    },
    all() {
      return Array.from(map.values())
    },
    matchPath(filePath: string) {
      for (const f of map.values()) {
        if (f.path === filePath) return f
      }
      return undefined
    },
  }
}

const defaultGlobals: Required<GlobalsConfig> = {
  format: "xml",
  wrapper: "context",
  briefByDefault: false,
}

const choresRef = makeRef("chores", "/project/dev/chores.xml", "Active chores")
const scopeRef = makeRef("scope", "/project/dev/scope.xml")
const defaultRegistry = makeRegistry([choresRef, scopeRef])

const baseConfig: RCTConfig = {
  files: [
    { alias: "chores", path: "dev/chores.xml", brief: "Active chores" },
    { alias: "scope", path: "dev/scope.xml" },
  ],
  lang: {
    typescript: {
      tools: [{ name: "bun" }],
    },
  },
  test: { command: "bun test" },
  rules: [
    {
      on: "PreToolUse",
      match: { target: "file_path", pattern: ".*" },
      action: "block",
      message: "test",
    },
    {
      on: "PreToolUse",
      match: { target: "file_path", pattern: ".*" },
      action: "warn",
      message: "test2",
    },
  ],
}

describe("generateMeta", () => {
  test("includes files section with aliases and paths", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "xml" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    expect(result).toContain("chores")
    expect(result).toContain("scope")
    expect(result).toContain("dev/chores.xml")
    expect(result).toContain("dev/scope.xml")
  })

  test("brief mode shows compact output", () => {
    const meta: MetaConfig = {
      include: ["files"],
      brief: true,
      contents: { enumeration: "xml" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    expect(result).toContain("chores")
    expect(result).toContain("Active chores")
  })

  test("xml enumeration wraps in <rct-meta> tags", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "xml" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    expect(result).toContain("<rct-meta>")
    expect(result).toContain("</rct-meta>")
  })

  test("json enumeration returns JSON string", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("files")
    expect(Array.isArray(parsed.files)).toBe(true)
  })

  test("path enumeration adds path headers", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "path" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    // Should contain path-labeled sections
    expect(result).toContain("files:")
  })

  test("raw enumeration returns plain text", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "raw" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    // Should not have XML tags or JSON braces wrapping
    expect(result).not.toContain("<rct-meta>")
    expect(result).toContain("chores")
  })

  test("respects include filter", () => {
    const meta: MetaConfig = {
      include: ["files"],
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("files")
    expect(parsed).not.toHaveProperty("lang")
    expect(parsed).not.toHaveProperty("test")
    expect(parsed).not.toHaveProperty("rules")
  })

  test("includes lang section", () => {
    const meta: MetaConfig = {
      include: ["lang"],
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("lang")
    expect(parsed.lang).toContainEqual(
      expect.objectContaining({ language: "typescript", tools: ["bun"] }),
    )
  })

  test("includes test section", () => {
    const meta: MetaConfig = {
      include: ["test"],
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("test")
    expect(parsed.test.configured).toBe(true)
  })

  test("includes rules section with count and summary", () => {
    const meta: MetaConfig = {
      include: ["rules"],
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("rules")
    expect(parsed.rules.count).toBe(2)
    expect(parsed.rules.actions).toContain("block")
    expect(parsed.rules.actions).toContain("warn")
  })

  test("includes files and lang by default when include not specified", () => {
    const meta: MetaConfig = {
      contents: { enumeration: "json" },
    }
    const result = generateMeta(baseConfig, defaultRegistry, defaultGlobals, meta)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("files")
    expect(parsed).toHaveProperty("lang")
    expect(parsed).not.toHaveProperty("test")
    expect(parsed).not.toHaveProperty("rules")
  })
})
