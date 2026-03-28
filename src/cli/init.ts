#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import type { RCTConfig, LangConfig, LangEntry } from "../config/types"

interface DetectionResult {
  lang: LangConfig
  testCommand: string | null
  files: { alias: string; path: string }[]
}

export function detectProject(root: string): DetectionResult {
  const lang: LangConfig = {}
  const files: { alias: string; path: string }[] = []
  let testCommand: string | null = null

  // Detect TypeScript/JavaScript
  if (existsSync(path.join(root, "tsconfig.json")) || existsSync(path.join(root, "package.json"))) {
    const entry: LangEntry = { tools: [], config: [] }
    if (existsSync(path.join(root, "tsconfig.json"))) {
      entry.config!.push({ name: "tsconfig", path: "tsconfig.json", extractPaths: true })
    }
    // Detect bun
    if (existsSync(path.join(root, "bun.lock")) || existsSync(path.join(root, "bun.lockb"))) {
      entry.tools!.push({ name: "bun", scripts: true })
      testCommand = "bun test"
    }
    // Detect npm/pnpm
    else if (existsSync(path.join(root, "package-lock.json"))) {
      entry.tools!.push({ name: "npm", scripts: true })
      testCommand = "npm test"
    } else if (existsSync(path.join(root, "pnpm-lock.yaml"))) {
      entry.tools!.push({ name: "pnpm", scripts: true })
      testCommand = "pnpm test"
    }
    if (entry.tools!.length > 0 || entry.config!.length > 0) {
      lang.typescript = entry
    }
  }

  // Detect Python
  if (existsSync(path.join(root, "pyproject.toml")) || existsSync(path.join(root, "pixi.toml"))) {
    const entry: LangEntry = { tools: [], config: [] }
    if (existsSync(path.join(root, "pyproject.toml"))) {
      entry.config!.push({ name: "pyproject", path: "pyproject.toml" })
    }
    if (existsSync(path.join(root, "pixi.toml"))) {
      entry.tools!.push({ name: "pixi", tasks: true, environment: true })
      if (!testCommand) testCommand = "pixi run test"
    }
    if (entry.tools!.length > 0 || entry.config!.length > 0) {
      lang.python = entry
    }
  }

  // Detect Rust
  if (existsSync(path.join(root, "Cargo.toml"))) {
    lang.rust = {
      tools: [{ name: "cargo" }],
      config: [{ name: "cargo-toml", path: "Cargo.toml" }]
    }
    if (!testCommand) testCommand = "cargo test"
  }

  // Detect common reference files
  const commonFiles = [
    { check: "dev/chores.xml", alias: "chores", path: "dev/chores.xml" },
    { check: "dev/scope.xml", alias: "scope", path: "dev/scope.xml" },
    { check: ".claude/plans/index.xml", alias: "plans", path: ".claude/plans/index.xml" },
  ]
  for (const f of commonFiles) {
    if (existsSync(path.join(root, f.check))) {
      files.push({ alias: f.alias, path: f.path })
    }
  }

  return { lang, testCommand, files }
}

export function generateConfig(detection: DetectionResult): RCTConfig {
  const config: RCTConfig = {}

  if (Object.keys(detection.lang).length > 0) {
    config.lang = detection.lang
  }

  if (detection.testCommand) {
    config.test = { command: detection.testCommand, injectOn: "SessionStart" }
  }

  if (detection.files.length > 0) {
    config.files = detection.files.map(f => ({
      alias: f.alias,
      path: f.path,
      injectOn: "SessionStart" as const
    }))
  }

  return config
}

export function mergeSettings(settingsPath: string, config: RCTConfig): void {
  // Read existing settings.json
  let settings: Record<string, any> = {}
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
  }

  // Merge hooks (don't overwrite existing)
  if (!settings.hooks) settings.hooks = {}

  const hookCommand = "bun run node_modules/reactive-context-toolkit/dist/hook.js"

  // Determine which events are needed from config
  const preToolMatchers = new Set<string>()
  const postToolMatchers = new Set<string>()

  for (const rule of config.rules ?? []) {
    if (rule.matcher) {
      const matchers = rule.on === "PreToolUse" ? preToolMatchers : postToolMatchers
      rule.matcher.split("|").forEach(m => matchers.add(m))
    }
  }
  for (const inj of config.injections ?? []) {
    const matchers = inj.on === "PreToolUse" ? preToolMatchers : postToolMatchers
    if (inj.matcher) {
      inj.matcher.split("|").forEach(m => matchers.add(m))
    }
    if (inj.matchFile) {
      postToolMatchers.add("Read")
    }
  }

  // Add SessionStart hook
  const sessionHook = { type: "command", command: `${hookCommand} SessionStart` }
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [{ hooks: [sessionHook] }]
  }

  // Add PreToolUse hook if needed
  if (preToolMatchers.size > 0) {
    const matcher = Array.from(preToolMatchers).join("|")
    const hook = { type: "command", command: `${hookCommand} PreToolUse` }
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [{ matcher, hooks: [hook] }]
    }
  }

  // Add PostToolUse hook if needed
  if (postToolMatchers.size > 0) {
    const matcher = Array.from(postToolMatchers).join("|")
    const hook = { type: "command", command: `${hookCommand} PostToolUse` }
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [{ matcher, hooks: [hook] }]
    }
  }

  // Add hooks for other events used by injections/rules
  const otherEvents = new Set<string>()
  for (const inj of config.injections ?? []) {
    if (!["PreToolUse", "PostToolUse", "SessionStart"].includes(inj.on)) {
      otherEvents.add(inj.on)
    }
  }
  for (const rule of config.rules ?? []) {
    if (!["PreToolUse", "PostToolUse", "SessionStart"].includes(rule.on)) {
      otherEvents.add(rule.on)
    }
  }
  for (const event of otherEvents) {
    const hook = { type: "command", command: `${hookCommand} ${event}` }
    if (!settings.hooks[event]) {
      settings.hooks[event] = [{ hooks: [hook] }]
    }
  }

  // Ensure directory exists
  const dir = path.dirname(settingsPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8")
}

// CLI entry point
if (process.argv[1] === __filename || process.argv[1]?.endsWith("init.ts")) {
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  console.log("Detecting project structure...")
  const detection = detectProject(root)
  const config = generateConfig(detection)

  const configPath = path.join(root, "rct.config.json")
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
    console.log(`Created ${configPath}`)
  } else {
    console.log(`Config already exists at ${configPath}`)
  }

  const settingsPath = path.join(root, ".claude", "settings.json")
  mergeSettings(settingsPath, config)
  console.log(`Updated ${settingsPath}`)
}
