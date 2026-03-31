#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import type { RCTConfig, LangConfig, LangEntry, LangTool } from "../config/types"
import { fs } from "#util"

interface DetectionResult {
    lang: LangConfig
    testCommand: string | null
    files: { alias: string; path: string }[]
}

type NodePackageManager = "bun" | "pnpm" | "npm"

export function detectProject(root: string): DetectionResult {
    const lang: LangConfig = {}
    const files: { alias: string; path: string }[] = []
    const testCmds: string[] = []

    const at = (name: string) => path.join(root, name)
    const has = (name: string) => existsSync(at(name))

    // Detect TypeScript/JavaScript
    const hasPkg = has("package.json")
    const hasTsconfig = has("tsconfig.json")

    if (hasPkg || hasTsconfig) {
        // Detect package manager from lockfile
        let pmName: NodePackageManager | undefined
        if (has("bun.lock") || has("bun.lockb")) pmName = "bun"
        else if (has("pnpm-lock.yaml")) pmName = "pnpm"
        else if (has("package-lock.json")) pmName = "npm"

        const tool: LangTool | undefined = pmName
            ? { name: pmName, scripts: true }
            : undefined

        // Get test command from package.json scripts
        if (tool && hasPkg) {
            try {
                const pkg = JSON.parse(readFileSync(at("package.json"), "utf-8"))
                const testScript: string | undefined = pkg?.scripts?.test
                if (testScript) testCmds.push(testScript)
            } catch {
                // Ignore unreadable package.json
            }
        }

        const entry: LangEntry = {
            tools: tool ? [tool] : [],
        }

        if (hasTsconfig) {
            entry.config = [{ name: "tsconfig", path: at("tsconfig.json") }]
            lang.typescript = entry
        } else {
            lang.javascript = entry
        }
    }

    // Detect Python
    const hasPixiToml = has("pixi.toml")
    const hasPyproject = has("pyproject.toml")

    if (hasPixiToml || hasPyproject) {
        const tools: LangTool[] = []
        if (hasPixiToml) {
            tools.push({ name: "pixi", tasks: true, environment: true })
            testCmds.push("pixi run test")
        }
        lang.python = { tools }
    }

    // Detect Rust
    if (has("Cargo.toml")) {
        lang.rust = { tools: [{ name: "cargo" }] }
        testCmds.push("cargo test")
    }

    return {
        lang,
        testCommand: testCmds.length ? testCmds.join(" && ") : null,
        files,
    }
}

export function generateConfig(detection: DetectionResult): RCTConfig {
    const config: RCTConfig = {}

    if (Object.keys(detection.lang).length > 0) {
        config.lang = detection.lang
    }

    if (detection.testCommand) {
        config.test = {
            command: detection.testCommand,
            injectOn: "SessionStart",
        }
    }

    if (detection.files.length > 0) {
        config.files = detection.files.map(f => ({
            alias: f.alias,
            path: f.path,
            injectOn: "SessionStart" as const,
        }))
    }

    return config
}

export function mergeSettings(settingsPath: string, config: RCTConfig): void {
    // Read existing settings.json
    let settings: Record<string, any> = {}
    if (existsSync(settingsPath)) {
        try {
            settings = JSON.parse(readFileSync(settingsPath, "utf-8"))
        } catch {
            console.error(
                `Error: ${settingsPath} contains invalid JSON. Fix it before running rct init.`,
            )
            process.exit(1)
        }
    }

    // Merge hooks (don't overwrite existing)
    if (!settings.hooks) settings.hooks = {}

    const hookCommand = "bun run rct hook"

    // Determine which events are needed from config
    const preToolMatchers = new Set<string>()
    const postToolMatchers = new Set<string>()

    for (const rule of config.rules ?? []) {
        if (rule.matcher) {
            const matchers =
                rule.on === "PreToolUse" ? preToolMatchers : postToolMatchers
            rule.matcher.split("|").forEach(m => matchers.add(m))
        }
    }
    for (const inj of config.injections ?? []) {
        const matchers =
            inj.on === "PreToolUse" ? preToolMatchers : postToolMatchers
        if (inj.matcher) {
            inj.matcher.split("|").forEach(m => matchers.add(m))
        }
        if (inj.matchFile) {
            postToolMatchers.add("Read")
        }
    }

    // Add SessionStart hook
    const sessionHook = {
        type: "command",
        command: `${hookCommand} SessionStart`,
    }
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
export default function initializeRCT() {
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
