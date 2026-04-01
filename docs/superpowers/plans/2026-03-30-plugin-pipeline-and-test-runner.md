# Plugin Pipeline + Test Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the plugin system into the full evaluation pipeline, fix all audit-identified type/schema bugs, and overhaul test result formatting to be format-aware, minification-aware, and language-tool-aware.

**Architecture:** Plugins are merged into config before desugaring via a new `applyPlugins()` step in `schema.ts`. Test results are produced by an updated `formatTestResult()` that wraps output in XML or JSON based on `TestConfig.format`, includes the resolved tool name, and supports `{tool}` in brief templates. Minification of test result content is handled by the existing compose pipeline — no duplication needed.

**Tech Stack:** TypeScript/Bun, `bun test` for all tests, no new runtime deps.

---

## File Map

| File                       | Change                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/config/schema.ts`     | Fix `DEFAULT_GLOBALS` type; fix alias derivation; add `applyPlugins()`                           |
| `src/cli/hook.ts`          | Call `applyPlugins()` in pipeline; pass format/tool to `formatTestResult`                        |
| `src/test/runner.ts`       | `resolveTestCommand` returns `{command, tool}`; `formatTestResult` is format/tool-aware          |
| `src/engine/meta.ts`       | Fix `getPluginSectionValues` flat-map bug                                                        |
| `rct.config.schema.json`   | Add `MinifyConfig` `$defs`, add `minify` to `GlobalsConfig`/`InjectionEntry`, fix `plugins` enum |
| `package.json`             | Add `build` script                                                                               |
| `test/schema.test.ts`      | Add no-alias desugar test; add `applyPlugins` tests                                              |
| `test/test-runner.test.ts` | Add format/tool/brief tests                                                                      |
| `test/meta.test.ts`        | Add plugin section value tests                                                                   |
| `test/integration.test.ts` | Fix stale describe label                                                                         |
| `test/plugin.test.ts`      | **New** — unit tests for plugin registry, issueScope, trackWork                                  |

---

## Task 1: Fix `DEFAULT_GLOBALS` type error and alias derivation mismatch

**Files:**

- Modify: `src/config/schema.ts`
- Test: `test/schema.test.ts`

Two bugs in `schema.ts`:

1. `DEFAULT_GLOBALS` is typed `Required<GlobalsConfig>` but omits `plugins`, causing a compile-time type error.
2. `desugarFileInjections` derives alias via `path.basename(file.path)` (keeps extension), while `buildFileRegistry` uses `fs.stem` (strips extension). For alias-less entries this means generated `FileRef` values like `"scope.xml"` never resolve in the registry which stores `"scope"`.

- [ ] **Step 1: Write the failing test for no-alias desugar**

In `test/schema.test.ts`, add to the `desugarFileInjections` describe block:

```ts
test('derives alias using stem (no extension) for files without explicit alias', () => {
    const config = validateConfig({
        files: [{ path: 'dev/scope.xml', injectOn: 'SessionStart' }],
    })
    const result = desugarFileInjections(config)
    // The generated injection ref must be "scope", not "scope.xml"
    expect(result.injections).toHaveLength(1)
    expect(result.injections![0].inject[0]).toBe('scope')
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test test/schema.test.ts --test-name-pattern "derives alias using stem"
```

Expected: FAIL — the current `path.basename` returns `"scope.xml"`, not `"scope"`.

- [ ] **Step 3: Fix `desugarFileInjections` to use `fs.stem`**

In `src/config/schema.ts`:

Add import at top:

```ts
import { fs } from '#util/fs'
```

Change line 80:

```ts
// Before:
const alias = file.alias ?? path.basename(file.path)
// After:
const alias = file.alias ?? fs.stem(file.path)
```

Also change the metaFile alias derivation at line 105 similarly:

```ts
// Before:
const metaAlias = meta.alias ?? meta.path
// After:
const metaAlias = meta.alias ?? fs.stem(meta.path)
```

- [ ] **Step 4: Fix `DEFAULT_GLOBALS` type error**

In `src/config/schema.ts`, `DEFAULT_GLOBALS` must satisfy `Required<GlobalsConfig>` which now includes `plugins: string[]`. Add the field with a default empty array:

```ts
const DEFAULT_GLOBALS: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}
```

- [ ] **Step 5: Run the failing test to verify it passes**

```
bun test test/schema.test.ts
```

Expected: all schema tests PASS.

- [ ] **Step 6: Fix `defaultGlobals` in `test/meta.test.ts`**

After Task 1 adds `plugins: string[]` to `Required<GlobalsConfig>`, the existing `defaultGlobals` constant in `test/meta.test.ts` becomes a TypeScript compile error (missing `minify` and `plugins` fields). Find the `defaultGlobals` declaration in that file and update it:

```ts
const defaultGlobals: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}
```

Run `bun test test/meta.test.ts` — all existing meta tests should still PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts test/schema.test.ts test/meta.test.ts
git commit -m "fix: align alias derivation between desugar and registry; fix DEFAULT_GLOBALS type"
```

---

## Task 2: Fix `getPluginSectionValues` flatten bug in `meta.ts`

**Files:**

- Modify: `src/engine/meta.ts`
- Test: `test/meta.test.ts`

`getPluginSectionValues<FileEntry>(config, "files")` pushes `plugin.files` (a `FileEntry[]`) directly into a `T[]` accumulator. This produces `FileEntry[][]`, not `FileEntry[]`. The downstream `.map(f => f.alias)` then receives arrays instead of `FileEntry` objects, silently producing wrong output or crashing.

- [ ] **Step 1: Write the failing test**

In `test/meta.test.ts`, add the following import if `buildFileRegistry` is not already imported:

```ts
import { buildFileRegistry } from '../src/config/files'
```

Then add to the `generateMeta` describe block:

```ts
test('includes plugin-contributed files in files section', () => {
    const config: RCTConfig = {
        globals: { plugins: ['track-work'] },
        files: [{ alias: 'my-file', path: 'my-file.xml' }],
    }
    const registry = buildFileRegistry([])
    const result = generateMeta(
        config,
        registry,
        { ...defaultGlobals, plugins: ['track-work'] },
        { include: ['files'] },
    )
    // track-work plugin contributes "chores" and "plans" files
    expect(result).toContain('chores')
    expect(result).toContain('plans')
    // Original file should also appear
    expect(result).toContain('my-file')
})

test('includes plugin-contributed rules in rules section', () => {
    // issueScope has no rules currently, but we can test that the section
    // doesn't crash when plugins are active
    const config: RCTConfig = {
        globals: { plugins: ['track-work'] },
        rules: [
            {
                on: 'PreToolUse',
                match: { target: 'tool_name', pattern: 'Bash' },
                action: 'warn',
                message: 'test',
            },
        ],
    }
    const registry = buildFileRegistry([])
    const result = generateMeta(
        config,
        registry,
        { ...defaultGlobals, plugins: ['track-work'] },
        { include: ['rules'] },
    )
    expect(result).toContain('count="1"')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun test test/meta.test.ts --test-name-pattern "plugin-contributed"
```

- [ ] **Step 3: Fix `getPluginSectionValues`**

In `src/engine/meta.ts`, change `getPluginSectionValues` from a push to a flat-push:

```ts
function getPluginSectionValues<T>(
    config: RCTConfig,
    prop: keyof RCTPlugin,
): T[] {
    const values: T[] = []
    for (const name of config.globals?.plugins ?? [])
        if (name in plugins) {
            const val = plugins[name][prop]
            if (Array.isArray(val)) values.push(...(val as T[]))
        }
    return values
}
```

- [ ] **Step 4: Run tests**

```
bun test test/meta.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/meta.ts test/meta.test.ts
git commit -m "fix: flatten plugin section values in meta; add plugin meta tests"
```

---

## Task 3: Add `applyPlugins()` and wire into hook pipeline

**Files:**

- Modify: `src/config/schema.ts`
- Modify: `src/cli/hook.ts`
- Test: `test/schema.test.ts`

Plugins declare `files` (with `injectOn`) and `rules`. These must be merged into the config before `desugarFileInjections` and `buildFileRegistry` run. The cleanest approach is a pure config transform `applyPlugins(config)` in `schema.ts` that spreads plugin contributions into `config.files` and `config.rules`.

- [ ] **Step 1: Write failing tests for `applyPlugins`**

In `test/schema.test.ts`, add a new `describe("applyPlugins", ...)` block:

```ts
import {
    validateConfig,
    desugarFileInjections,
    applyPlugins,
} from '../src/config/schema'

describe('applyPlugins', () => {
    test('returns config unchanged when no plugins activated', () => {
        const config = validateConfig({
            files: [{ alias: 'mine', path: 'mine.xml' }],
        })
        const result = applyPlugins(config)
        expect(result.files).toHaveLength(1)
        expect(result.rules).toBeUndefined()
    })

    test('merges track-work plugin files into config.files', () => {
        const config = validateConfig({ globals: { plugins: ['track-work'] } })
        const result = applyPlugins(config)
        const aliases = (result.files ?? []).map((f) => f.alias)
        expect(aliases).toContain('chores')
        expect(aliases).toContain('plans')
    })

    test('merges plugin files alongside existing config files', () => {
        const config = validateConfig({
            globals: { plugins: ['track-work'] },
            files: [{ alias: 'my-file', path: 'my-file.xml' }],
        })
        const result = applyPlugins(config)
        const aliases = (result.files ?? []).map((f) => f.alias)
        expect(aliases).toContain('my-file')
        expect(aliases).toContain('chores')
    })

    test('desugar after applyPlugins generates injections for plugin files with injectOn', () => {
        const config = validateConfig({ globals: { plugins: ['track-work'] } })
        const applied = applyPlugins(config)
        const desugared = desugarFileInjections(applied)
        const refs = (desugared.injections ?? []).flatMap((i) => i.inject)
        expect(refs).toContain('chores')
        expect(refs).toContain('plans')
    })

    test('ignores unknown plugin names', () => {
        const config = validateConfig({
            globals: { plugins: ['nonexistent-plugin'] },
        })
        expect(() => applyPlugins(config)).not.toThrow()
        const result = applyPlugins(config)
        expect(result.files ?? []).toHaveLength(0)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun test test/schema.test.ts --test-name-pattern "applyPlugins"
```

Expected: FAIL — `applyPlugins` is not exported.

- [ ] **Step 3: Implement `applyPlugins` in `schema.ts`**

Add to `src/config/schema.ts` (after the existing imports):

```ts
import plugins from '#plugin'
import type { FileEntry, RuleEntry } from './types'

export function applyPlugins(config: ValidatedConfig): ValidatedConfig {
    const pluginNames = config.globals.plugins ?? []
    if (pluginNames.length === 0) return config

    const mergedFiles: FileEntry[] = [...(config.files ?? [])]
    const mergedRules: RuleEntry[] = [...(config.rules ?? [])]

    for (const name of pluginNames) {
        if (!(name in plugins)) continue
        const plugin = plugins[name]
        if (plugin.files) mergedFiles.push(...plugin.files)
        if (plugin.rules) mergedRules.push(...plugin.rules)
    }

    return {
        ...config,
        files: mergedFiles,
        rules: mergedRules.length > 0 ? mergedRules : config.rules,
    }
}
```

- [ ] **Step 4: Wire `applyPlugins` into `hook.ts`**

In `src/cli/hook.ts`, add import:

```ts
import {
    validateConfig,
    desugarFileInjections,
    applyPlugins,
} from '#config/schema'
```

Change the pipeline setup (after `validateConfig`):

```ts
const validated = validateConfig(config)
const withPlugins = applyPlugins(validated) // NEW
const desugared = desugarFileInjections(withPlugins) // was: desugarFileInjections(validated)
```

- [ ] **Step 5: Run all tests**

```
bun test test/schema.test.ts test/integration.test.ts
```

Expected: PASS. The integration test's `SessionStart` test still passes because the fixture config has no plugins.

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/cli/hook.ts test/schema.test.ts
git commit -m "feat: add applyPlugins() and wire plugin contributions into hook pipeline"
```

---

## Task 4: Add plugin unit tests

**Files:**

- Create: `test/plugin.test.ts`

- [ ] **Step 1: Write plugin unit tests**

Create `test/plugin.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import pluginRegistry from '../src/plugin/index'
import type { RCTPlugin } from '../src/plugin/types'

describe('plugin registry', () => {
    test('contains track-work and issue-scope', () => {
        expect('track-work' in pluginRegistry).toBe(true)
        expect('issue-scope' in pluginRegistry).toBe(true)
    })

    test('each plugin has a name matching its registry key', () => {
        for (const [key, plugin] of Object.entries(pluginRegistry)) {
            expect(plugin.name).toBe(key)
        }
    })
})

describe('track-work plugin', () => {
    const plugin: RCTPlugin = pluginRegistry['track-work']

    test("has name 'track-work'", () => {
        expect(plugin.name).toBe('track-work')
    })

    test('contributes chores and plans files', () => {
        const aliases = (plugin.files ?? []).map((f) => f.alias)
        expect(aliases).toContain('chores')
        expect(aliases).toContain('plans')
    })

    test('chores file has injectOn: SessionStart', () => {
        const chores = (plugin.files ?? []).find((f) => f.alias === 'chores')
        expect(chores?.injectOn).toBe('SessionStart')
    })

    test('chores and plans have entry-schema metaFile', () => {
        for (const file of plugin.files ?? []) {
            expect(
                file.metaFiles?.some((m) => m.alias === 'entry-schema'),
            ).toBe(true)
        }
    })
})

describe('issue-scope plugin', () => {
    const plugin: RCTPlugin = pluginRegistry['issue-scope']

    test("has name 'issue-scope'", () => {
        expect(plugin.name).toBe('issue-scope')
    })

    test('contributes scope and candidates files', () => {
        const aliases = (plugin.files ?? []).map((f) => f.alias)
        expect(aliases).toContain('scope')
        expect(aliases).toContain('candidates')
    })

    test('scope file has injectOn: SessionStart', () => {
        const scope = (plugin.files ?? []).find((f) => f.alias === 'scope')
        expect(scope?.injectOn).toBe('SessionStart')
    })

    test('scope file has staleCheck configured', () => {
        const scope = (plugin.files ?? []).find((f) => f.alias === 'scope')
        expect(scope?.staleCheck).toBeDefined()
        expect(scope?.staleCheck?.dateTag).toBe('date')
    })
})
```

- [ ] **Step 2: Run tests**

```
bun test test/plugin.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/plugin.test.ts
git commit -m "test: add plugin registry, issueScope, and trackWork unit tests"
```

---

## Task 5: Update test runner — format-aware, tool-aware, minify-aware

**Files:**

- Modify: `src/test/runner.ts`
- Modify: `src/cli/hook.ts`
- Test: `test/test-runner.test.ts`

**Current problems:**

1. `resolveTestCommand` returns only the command string — the tool that resolved it (bun, cargo, etc.) is lost.
2. `formatTestResult` produces a bare string like `"test: pass"` — it does not wrap output in XML or JSON, ignores `TestConfig.format`, and does not support `{tool}` in brief templates.
3. `hook.ts` calls `formatTestResult(result, (testConfig as any).brief)` — the `as any` cast is wrong (testConfig is already `TestConfig`), and `format` from `testConfig` is never passed.

**Design after fix:**

- `resolveTestCommand` returns `{ command: string; tool: string } | null`. For explicit string commands, `tool` is `"custom"`.
- `formatTestResult` signature becomes: `formatTestResult(result: TestResult, testConfig: TestConfig, globals: Required<GlobalsConfig>): string`
- Brief templates support `{tool}` in addition to `{status}`, `{exitCode}`, `{output}`.
- Default XML format: `<test tool="bun" status="pass"/>` or `<test tool="bun" status="fail" exitCode="1"/>`.
- Default JSON format: `{"test":{"tool":"bun","status":"pass"}}` or `{"test":{"tool":"bun","status":"fail","exitCode":1}}`.
- The `tool` field comes from `TestResult.tool` — `runTest` is unchanged, `hook.ts` merges it in after calling `runTest`.

- [ ] **Step 1: Write failing tests**

In `test/test-runner.test.ts`, add:

```ts
import type { GlobalsConfig } from '#config/types'

const defaultGlobals: Required<GlobalsConfig> = {
    format: 'xml',
    wrapper: 'context',
    briefByDefault: false,
    minify: true,
    plugins: [],
}

describe('resolveTestCommand returns tool info', () => {
    test('returns tool name for lang-detected command', () => {
        const config: RCTConfig = {
            test: true,
            lang: { typescript: { tools: [{ name: 'bun', scripts: true }] } },
        }
        const info = resolveTestCommand(config)
        expect(info).not.toBeNull()
        expect(info!.command).toBe('bun test')
        expect(info!.tool).toBe('bun')
    })

    test("returns 'custom' tool for explicit command string", () => {
        const config: RCTConfig = { test: 'pytest -x' }
        const info = resolveTestCommand(config)
        expect(info!.command).toBe('pytest -x')
        expect(info!.tool).toBe('custom')
    })

    test('returns cargo tool for rust lang', () => {
        const config: RCTConfig = {
            test: true,
            lang: { rust: { tools: [{ name: 'cargo', tasks: true }] } },
        }
        const info = resolveTestCommand(config)
        expect(info!.tool).toBe('cargo')
    })
})

describe('formatTestResult with format', () => {
    test('xml format pass produces self-closing test tag', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'bun',
        }
        const testConfig = { command: 'bun test' as const }
        const out = formatTestResult(result, testConfig, defaultGlobals)
        expect(out).toContain('<test')
        expect(out).toContain('tool="bun"')
        expect(out).toContain('status="pass"')
    })

    test('xml format fail includes exitCode attribute', () => {
        const result: TestResult = {
            status: 'fail',
            exitCode: 1,
            output: '',
            tool: 'bun',
        }
        const out = formatTestResult(
            result,
            { command: 'bun test' },
            defaultGlobals,
        )
        expect(out).toContain('exitCode="1"')
    })

    test('json format produces json object', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'cargo',
        }
        const jsonGlobals = { ...defaultGlobals, format: 'json' as const }
        const out = formatTestResult(
            result,
            { command: 'cargo test' },
            jsonGlobals,
        )
        const parsed = JSON.parse(out)
        expect(parsed.test.tool).toBe('cargo')
        expect(parsed.test.status).toBe('pass')
    })

    test('brief template supports {tool} substitution', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'pixi',
        }
        const testConfig = {
            command: 'pixi run test' as const,
            brief: '[{tool}] {status}',
        }
        const out = formatTestResult(result, testConfig, defaultGlobals)
        expect(out).toBe('[pixi] pass')
    })

    test('format override in TestConfig takes precedence over globals', () => {
        const result: TestResult = {
            status: 'pass',
            exitCode: 0,
            output: '',
            tool: 'bun',
        }
        const testConfig = {
            command: 'bun test' as const,
            format: 'json' as const,
        }
        const out = formatTestResult(result, testConfig, defaultGlobals)
        const parsed = JSON.parse(out)
        expect(parsed.test).toBeDefined()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun test test/test-runner.test.ts --test-name-pattern "returns tool info|with format"
```

- [ ] **Step 3: Update `TestResult` type and `resolveTestCommand` in `runner.ts`**

In `src/test/runner.ts`:

```ts
import type {
    RCTConfig,
    TestConfig,
    LangEntry,
    LangTool,
    Format,
    GlobalsConfig,
} from '#config/types'
import { xml } from '#util/xml'

export interface TestResult {
    status: 'pass' | 'fail'
    exitCode: number
    output: string
    tool?: string // optional: set by hook.ts after resolveTestCommand; absent in raw runTest output
}

export interface TestCommandInfo {
    command: string
    tool: string
}

// Internal helper — returns command + tool name
function findFirstToolInfo(config: RCTConfig): TestCommandInfo | null {
    if (!config.lang) return null

    const langEntries: (LangEntry | undefined)[] = [
        config.lang.typescript,
        config.lang.javascript,
        config.lang.python,
        config.lang.rust,
    ]

    for (const entry of langEntries) {
        if (!entry?.tools) continue
        for (const tool of entry.tools) {
            if (!tool.tasks && !tool.scripts) continue
            const cmd = TOOL_TEST_COMMANDS[tool.name]
            if (cmd) return { command: cmd, tool: tool.name }
        }
    }

    return null
}

export function resolveTestCommand(config: RCTConfig): TestCommandInfo | null {
    if (!config.test) return null

    if (typeof config.test === 'string')
        return { command: config.test, tool: 'custom' }

    if (config.test === true) return findFirstToolInfo(config)

    const testConfig = config.test as TestConfig
    if (typeof testConfig.command === 'string')
        return { command: testConfig.command, tool: 'custom' }
    if (testConfig.command === true) return findFirstToolInfo(config)

    return null
}

export function formatTestResult(
    result: TestResult,
    testConfig: TestConfig,
    globals: Required<GlobalsConfig>,
): string {
    const brief = testConfig.brief
    if (brief) {
        return brief
            .replace(/\{status\}/g, result.status)
            .replace(/\{exitCode\}/g, String(result.exitCode))
            .replace(/\{output\}/g, result.output)
            .replace(/\{tool\}/g, result.tool)
    }

    const format: Format = testConfig.format ?? globals.format
    const toolAttr = result.tool ?? 'unknown'
    const attrs: Record<string, string> = {
        tool: toolAttr,
        status: result.status,
        ...(result.status === 'fail' && { exitCode: String(result.exitCode) }),
    }

    if (format === 'json') {
        return JSON.stringify({
            test: {
                tool: toolAttr,
                status: result.status,
                ...(result.status === 'fail' && { exitCode: result.exitCode }),
            },
        })
    }

    // Default: xml
    return xml.inline('test', attrs)
}
```

- [ ] **Step 4: Update `hook.ts` to pass format context**

In `src/cli/hook.ts`, update the test runner section:

```ts
// Test
let testResult: string | null = null
if (desugared.test) {
    const testConfig: TestConfig =
        typeof desugared.test === 'object' && desugared.test !== true ?
            (desugared.test as TestConfig)
        :   { command: desugared.test as true | string }

    const rawInjectOn = testConfig.injectOn
    const testEvents: HookEvent[] =
        Array.isArray(rawInjectOn) ? rawInjectOn : (
            [rawInjectOn ?? 'SessionStart']
        )

    if (testEvents.includes(event)) {
        const cmdInfo = resolveTestCommand(desugared)
        if (cmdInfo) {
            const sessionId =
                (payload as Record<string, string>).session_id ?? 'unknown'
            const cacheEnabled = testConfig.cache === true
            const cacheTTL = testConfig.cacheTTL ?? 300

            let rawResult =
                cacheEnabled ?
                    getCachedResult(sessionId, cmdInfo.command, cacheTTL)
                :   null
            if (!rawResult) {
                rawResult = runTest(cmdInfo.command, CLAUDE_PROJECT_DIR)
                if (cacheEnabled)
                    setCachedResult(sessionId, cmdInfo.command, rawResult)
            }

            // Merge tool info into result
            const result = { ...rawResult, tool: cmdInfo.tool }
            testResult = formatTestResult(result, testConfig, globals)
        }
    }
}
```

Update the import in `hook.ts` to remove the now-unused `formatTestResult` direct brief arg form:

```ts
import {
    resolveTestCommand,
    runTest,
    formatTestResult,
    getCachedResult,
    setCachedResult,
} from '#test/runner'
```

- [ ] **Step 5: Update all existing `resolveTestCommand` tests**

The 8 existing `resolveTestCommand` tests assert against a plain string (`"bun test"`, `"pixi run test"`, etc.). After Step 3, `resolveTestCommand` returns `TestCommandInfo | null`. Update every assertion:

```ts
// Old pattern (replace all 8):
expect(resolveTestCommand(config)).toBe('bun test --coverage')
// New pattern:
expect(resolveTestCommand(config)?.command).toBe('bun test --coverage')

// For null check tests — no change needed:
expect(resolveTestCommand(config)).toBeNull()

// Add tool assertions to the lang-detection tests:
expect(resolveTestCommand(config)?.tool).toBe('bun') // for bun lang test
expect(resolveTestCommand(config)?.tool).toBe('pixi') // for pixi lang test
expect(resolveTestCommand(config)?.tool).toBe('cargo') // for cargo lang test
expect(resolveTestCommand(config)?.tool).toBe('custom') // for explicit string tests
```

- [ ] **Step 6: Update existing `formatTestResult` tests**

The old `formatTestResult` tests called it with `(result, brief?)`. Update them to match the new signature:

```ts
// Old:
formatTestResult(result, 'Result: {status} (code {exitCode})')
// New:
formatTestResult(
    result,
    { command: 'bun test', brief: 'Result: {status} (code {exitCode})' },
    defaultGlobals,
)

// Old:
formatTestResult(result) // no brief → "test: pass"
// New:
formatTestResult(result, { command: 'bun test' }, defaultGlobals)
// Expect: '<test tool="custom" status="pass"/>' for xml format
```

Update the three existing `formatTestResult` tests in `test/test-runner.test.ts` to:

- Use the new signature
- Update pass default expectation to `xml.inline("test", { tool: "custom", status: "pass" })`
- Update fail default expectation to `xml.inline("test", { tool: "custom", status: "fail", exitCode: "1" })`

- [ ] **Step 7: Run all test runner tests**

```
bun test test/test-runner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/test/runner.ts src/cli/hook.ts test/test-runner.test.ts
git commit -m "feat: format/tool-aware test result formatting with {tool} brief support"
```

---

## Task 6: Fix JSON schema (`minify` missing, `plugins` enum too narrow)

**Files:**

- Modify: `rct.config.schema.json`

Two issues:

1. `MinifyConfig` has no `$defs` entry, and `globals.minify` / `InjectionEntry.minify` are absent from the schema, but both objects have `additionalProperties: false`. This means any config using `minify` fails validation.
2. `globals.plugins` items are restricted to an enum `["track-work", "issue-scope"]` in the schema but typed as `string[]` in TypeScript. New plugins added to the codebase would require a schema update. The schema should remove the enum and use `type: "string"` with a description listing the built-ins.

- [ ] **Step 1: Write schema validation test**

In `test/schema.test.ts`, add:

```ts
describe('validateConfig with minify', () => {
    test('accepts boolean minify in globals', () => {
        // validateConfig doesn't run JSON schema, but the schema file is referenced
        // by consumers — test that the round-trip shape is accepted by our TypeScript types
        const config = validateConfig({ globals: { minify: false } })
        expect(config.globals.minify).toBe(false)
    })

    test('accepts MinifyConfig object in globals', () => {
        const config = validateConfig({
            globals: {
                minify: {
                    enabled: true,
                    separator: ' ',
                    preserveNewlines: true,
                },
            },
        })
        expect(typeof config.globals.minify).toBe('object')
    })

    test('accepts minify boolean on InjectionEntry', () => {
        const config = validateConfig({
            injections: [
                { on: 'SessionStart', inject: ['file'], minify: false },
            ],
        })
        expect(config.injections![0].minify).toBe(false)
    })
})
```

Run: `bun test test/schema.test.ts` — these should PASS already (the TypeScript types accept these values). This confirms the types are correct before schema fix.

- [ ] **Step 2: Add `MinifyConfig` to JSON schema `$defs`**

In `rct.config.schema.json`, add to the `$defs` object:

```json
"MinifyConfig": {
    "type": "object",
    "description": "Fine-grained control over whitespace condensation for token-efficient injection.",
    "properties": {
        "enabled": {
            "type": "boolean",
            "description": "Whether minification is enabled.",
            "default": true
        },
        "separator": {
            "type": "string",
            "description": "Replacement string for condensed whitespace runs.",
            "default": " "
        },
        "preserveNewlines": {
            "type": "boolean",
            "description": "Preserve newlines; only condense horizontal whitespace. Defaults to true for JSON format, false for XML."
        }
    },
    "additionalProperties": false
}
```

- [ ] **Step 3: Add `minify` property to `GlobalsConfig` in schema**

In the `$defs/GlobalsConfig/properties` section, add:

```json
"minify": {
    "description": "Minification of injected content. true/false or fine-grained config.",
    "oneOf": [
        { "type": "boolean" },
        { "$ref": "#/$defs/MinifyConfig" }
    ],
    "default": true
}
```

- [ ] **Step 4: Add `minify` property to `InjectionEntry` in schema**

In the `$defs/InjectionEntry/properties` section, add:

```json
"minify": {
    "type": "boolean",
    "description": "Override global minification for this injection entry."
}
```

- [ ] **Step 5: Fix `plugins` enum to accept any string**

In `$defs/GlobalsConfig/properties/plugins`, change the items definition from:

```json
"items": { "enum": ["track-work", "issue-scope"] }
```

To:

```json
"items": {
    "type": "string",
    "description": "Plugin name. Built-in options: 'track-work', 'issue-scope'."
}
```

- [ ] **Step 6: Commit**

```bash
git add rct.config.schema.json
git commit -m "fix: add MinifyConfig to JSON schema; fix plugins to accept any string"
```

---

## Task 7: Add `build` script to `package.json`

**Files:**

- Modify: `package.json`

CLAUDE.md documents `bun run build` as producing `dist/rct.js` — the hook subprocess file that Claude Code invokes. The build target should be `src/cli/hook.ts` (the hook entrypoint, not the CLI dispatcher) built to `dist/rct.js`. Bun-native consumers use the `bin` entry (`src/cli/index.ts`) directly; the build artifact is for pre-compiled distribution.

- [ ] **Step 1: Add build script**

In `package.json`, update `scripts`:

```json
"scripts": {
    "build": "bun build src/cli/hook.ts --outfile dist/rct.js --target bun --minify",
    "test": "bun test"
}
```

- [ ] **Step 2: Verify build runs**

```
bun run build
```

Expected: `dist/rct.js` created without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "fix: restore build script pointing to src/cli/index.ts"
```

---

## Task 8: Fix stale describe label and run full test suite

**Files:**

- Modify: `test/integration.test.ts`

- [ ] **Step 1: Fix stale label**

In `test/integration.test.ts`, line 19:

```ts
// Before:
describe("integration: hook.ts subprocess", () => {
// After:
describe("integration: cli subprocess", () => {
```

- [ ] **Step 2: Run full test suite**

```
bun test
```

Expected: all tests PASS. Fix any regressions before continuing.

- [ ] **Step 3: Commit**

```bash
git add test/integration.test.ts
git commit -m "fix: update stale integration test describe label"
```

---

## Task 9: Export plugin types from public barrel + final audit

**Files:**

- Modify: `src/index.ts`

The `RCTPlugin` type and plugin utilities are not exported from the public barrel, making it impossible for consumers to type-check custom plugins without reaching into internal paths.

- [ ] **Step 1: Add plugin exports to `src/index.ts`**

```ts
// Plugins
export type { RCTPlugin } from './plugin/types'
export { default as pluginRegistry } from './plugin/index'
```

- [ ] **Step 2: Add exports test**

In `test/exports.test.ts`, add:

```ts
import { pluginRegistry } from '../src/index'
import type { RCTPlugin } from '../src/index'

test('pluginRegistry is exported from barrel', () => {
    expect('track-work' in pluginRegistry).toBe(true)
})
```

- [ ] **Step 3: Run exports test**

```
bun test test/exports.test.ts
```

- [ ] **Step 4: Run full test suite one final time**

```
bun test
```

Expected: all tests PASS, no regressions.

- [ ] **Step 5: Final commit**

```bash
git add src/index.ts test/exports.test.ts
git commit -m "feat: export RCTPlugin type and pluginRegistry from public barrel"
```
