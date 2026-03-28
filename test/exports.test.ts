import { describe, it, expect } from "bun:test"

describe("barrel exports from src/index.ts", () => {
  it("exports config utilities", async () => {
    const mod = await import("../src/index")
    expect(mod.loadConfig).toBeFunction()
    expect(mod.CLAUDE_PROJECT_DIR).toBeDefined()
    expect(mod.validateConfig).toBeFunction()
    expect(mod.desugarFileInjections).toBeFunction()
    expect(mod.buildFileRegistry).toBeFunction()
  })

  it("exports engine functions", async () => {
    const mod = await import("../src/index")
    expect(mod.evaluateRules).toBeFunction()
    expect(mod.evaluateInjections).toBeFunction()
    expect(mod.evaluateMatch).toBeFunction()
    expect(mod.evaluateCondition).toBeFunction()
    expect(mod.generateMeta).toBeFunction()
    expect(mod.composeOutput).toBeFunction()
  })

  it("exports lang and test functions", async () => {
    const mod = await import("../src/index")
    expect(mod.evaluateLang).toBeFunction()
    expect(mod.resolveTestCommand).toBeFunction()
    expect(mod.runTest).toBeFunction()
    expect(mod.formatTestResult).toBeFunction()
  })

  it("exports register helpers", async () => {
    const mod = await import("../src/index")
    expect(mod.standard).toBeFunction()
    expect(mod.dynamic).toBeFunction()
    expect(mod.block).toBeFunction()
  })

  it("exports utilities", async () => {
    const mod = await import("../src/index")
    expect(mod.fs).toBeDefined()
    expect(mod.xml).toBeDefined()
    expect(mod.normalize).toBeFunction()
    expect(mod.minify).toBeFunction()
  })
})
