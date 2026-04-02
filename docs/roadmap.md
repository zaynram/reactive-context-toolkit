# Reactive Context Toolkit — Version Roadmap

**Last updated:** 2026-04-02
**Current version:** v1.0.0 (pending merge) / v1.1.0 features implemented on branch

## Design Philosophy

RCT is a support tool, not a product. Its value is measured by how effectively it reduces friction in projects that consume it (primarily DAISY). Engineering investment must be proportional to demonstrated workflow benefit.

This roadmap was validated through structured reasoning protocols:

- **Assumption-surfacing** audited 19 assumptions across 6 capability claims
- **Tradeoff-analysis** scored 4 alternatives against 6 weighted criteria

The core finding: most proposed "platform" features rest on high-fragility or ungrounded assumptions. The roadmap therefore takes a conservative, evidence-driven approach.

## v1.0.0 — Ship and Stabilize (current)

**Status:** In progress
**Identity:** First stable release. Ship and stop active development.

**Capabilities:**

- Plugin system with workspace package architecture
- Declarative plugins (files, rules) and imperative extensions (context, trigger)
- Plugin setup lifecycle with error isolation
- Three builtin plugins: issue-scope, track-work, tmux
- Hook pipeline: triggers → rules → injections → context → meta → lang → test → compose
- Self-briefing via `meta` configuration (no new code — uses existing `generateMeta`)
- Process enforcement via trigger plugins (block/warn on tool use patterns)

**What v1.0.0 deliberately excludes:**

- Transform hooks (plugins modifying other plugins' output)
- Claude-facing MCP tools for config editing
- Worktree-scoped hooks
- Cross-team context management

These exclusions are deliberate, not oversights. See "Deferred Features" below.

## v1.0.0 Self-Briefing Experiment

v1.0.0 includes a low-cost experiment: using `meta` injection on SessionStart to brief Claude on what RCT provides. Configure:

```json
{
    "meta": {
        "injectOn": "SessionStart",
        "include": ["files", "rules", "plugins"],
        "brief": true
    }
}
```

This tells Claude what files are tracked, what rules are active, and what plugins are loaded. The hypothesis: better context about the enforcement system improves compliance.

**Success criteria:** After using this in DAISY for 2+ work sessions, assess whether:

1. Claude references RCT-managed files more reliably
2. Rule violations decrease
3. The injected context is actually useful (not just noise)

If the experiment fails, the conclusion is that compliance gaps are a model capability limitation, not a tooling gap. This informs whether v1.1 features are worth pursuing.

## v1.1 — Conditional: Claude-Facing Config Tools

**Status:** Deferred pending v1.0.0 experiment results
**Prerequisite:** v1.0.0 self-briefing experiment shows compliance improvement

**Proposed capability:** An MCP server exposing RCT config read/write operations as tools Claude can call. This would let Claude:

- Add temporary injections mid-session
- Register new files for tracking
- Query what rules and injections are active

**Why deferred (assumption-surfacing findings):**

- Assumption A6 (valid self-modification scenarios) rated **high fragility** — Claude can already edit `rct.config.json` directly with existing file-editing tools
- Assumption A8 (self-modification safely boundable) rated **high fragility** — agent modifying own guardrails is a known hard problem
- Tradeoff-analysis scored this alternative at 2.85 weighted score vs. 1.45 for v1.0.0 Enhanced (1.40 gap — decisive)

**What would change the calculus:**

- Evidence that Claude's file editing of rct.config.json is unreliable or produces invalid configs
- A concrete DAISY workflow where mid-session config changes are needed and file editing is insufficient
- Successful v1.0.0 self-briefing experiment (validates that Claude can benefit from RCT awareness)

**Interface consideration:** If built, this should be a separate package (`rct-mcp-config`) that reads/writes the existing config format. It should NOT be part of the core hook handler.

## v2.0 — Conditional: Worktree Scoping & Team Context

**Status:** Speculative — no validated demand
**Prerequisite:** Evidence of multi-agent workflow patterns in DAISY

**Proposed capabilities:**

1. Worktree-aware hook execution (different rules/injections per worktree)
2. Team-scoped context management
3. Transform hooks (plugins modifying other plugins' output)

**Why speculative (assumption-surfacing findings):**

- Assumption A10 (worktree teams are real) rated **high fragility** — the developer works solo; exploring worktrees is not the same as using worktree-based agent teams in production
- Assumption A12 (context divergence causes harm) is **ungrounded** — no multi-agent workflow data exists
- Assumption A13 (RCT is the right layer for coordination) rated **high fragility** — cross-team coordination requires shared state and global view, which is fundamentally an orchestrator concern (MCP Task Orchestrator already exists for this)
- Assumption A15 (transform hooks have use cases) rated **high fragility** — no concrete scenario identified; additive-only covers all known patterns
- Tradeoff-analysis scored this at 3.75 weighted score (last place, 2.30 gap from winner)

**What would change the calculus:**

- The developer begins using worktree-based agent teams for DAISY development
- Concrete evidence that context divergence between agents causes implementation errors
- A demonstrated scenario where one plugin needs to modify another's output
- The MCP Task Orchestrator proves insufficient for team coordination

**Architectural note:** If worktree scoping is eventually needed, v1.0.0's plugin interface supports it without breaking changes. A `worktree-scope` plugin could use `trigger()` to conditionally block tool use and `context()` to conditionally inject content based on `process.cwd()` or git worktree metadata. This doesn't require new RCT core capabilities.

## Feature Ideas Not On Roadmap

These were considered but do not have a version target:

**Process enforcement plugins:**

e.g., "require reasoning protocols before design decisions"

- This is achievable TODAY with v1.0.0's `trigger()` function
- A plugin can inspect tool names and payloads to enforce process requirements
- Example: block `Write` to ADR files unless a reasoning protocol output is referenced
- No new RCT features needed — just plugin authoring

**Research depth enforcement:**

- The developer reports difficulty maintaining academic rigor when bouncing between claude.ai and claude-code
- This is a workflow/tooling gap outside RCT's scope — RCT manages hook-time context injection, not session-level conversation quality
- Better addressed by CLAUDE.md rules, reasoning protocol skills, or dedicated research tools

**Plugin dependency resolution:**

- One plugin depending on another (e.g., track-work depends on issue-scope)
- No demonstrated need; current plugins are independent
- Would add complexity to the resolution chain for no current benefit

## Maintenance Commitment

The developer intends to stop active RCT development after v1.0.0. Maintenance expectations:

- **Bug fixes:** Yes, as discovered through DAISY usage
- **Dependency updates:** Minimal, as RCT core has zero runtime dependencies
- **New features:** Only if the self-briefing experiment validates demand AND a feature passes the assumption-surfacing bar
- **Plugin ecosystem:** Community-contributed plugins are welcome but not actively supported
