import { describe, test, expect } from "bun:test"
import path from "path"
import { buildFileRegistry } from "../src/config/files"
import type { FileEntry } from "../src/config/types"

const ROOT = "/tmp/rct-test-root"

describe("buildFileRegistry", () => {
  const entries: FileEntry[] = [
    { alias: "chores", path: "dev/chores.xml", brief: "Active chores" },
    { path: "dev/scope.xml", staleCheck: { dateTag: "date", wrapTag: "stale-scope" } },
    {
      alias: "docs",
      path: "dev/docs.md",
      metaFiles: [{ alias: "meta", path: "dev/docs-meta.md" }],
    },
  ]

  test("creates registry from entries", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const all = reg.all()
    // 3 top-level files + 1 meta file
    expect(all.length).toBe(3)
  })

  test("uses filename as key when alias absent", () => {
    const reg = buildFileRegistry(entries, ROOT)
    // "dev/scope.xml" has no alias, so use filename "scope.xml"
    const file = reg.get("scope.xml")
    expect(file).toBeDefined()
    expect(file!.path).toContain("scope.xml")
  })

  test("get returns file by alias", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const file = reg.get("chores")
    expect(file).toBeDefined()
    expect(file!.alias).toBe("chores")
    expect(file!.brief).toBe("Active chores")
  })

  test("metaFiles accessible via parent:meta colon notation", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const ref = reg.getRef("docs:meta")
    expect(ref).toBeDefined()
    expect(ref!.file.alias).toBe("meta")
    expect(ref!.file.path).toContain("docs-meta.md")
  })

  test("select returns matching files", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const selected = reg.select("chores", "docs")
    expect(selected).toHaveLength(2)
    expect(selected.map(f => f.alias)).toContain("chores")
    expect(selected.map(f => f.alias)).toContain("docs")
  })

  test("select ignores unknown aliases", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const selected = reg.select("chores", "nonexistent")
    expect(selected).toHaveLength(1)
  })

  test("getRef with ~brief flag", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const ref = reg.getRef("chores~brief")
    expect(ref).toBeDefined()
    expect(ref!.useBrief).toBe(true)
    expect(ref!.file.alias).toBe("chores")
  })

  test("getRef without ~brief flag", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const ref = reg.getRef("chores")
    expect(ref).toBeDefined()
    expect(ref!.useBrief).toBe(false)
  })

  test("matchPath matches normalized paths", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const file = reg.matchPath(path.join(ROOT, "dev/chores.xml"))
    expect(file).toBeDefined()
    expect(file!.alias).toBe("chores")
  })

  test("matchPath returns undefined for unmatched path", () => {
    const reg = buildFileRegistry(entries, ROOT)
    const file = reg.matchPath("/some/other/file.txt")
    expect(file).toBeUndefined()
  })
})
