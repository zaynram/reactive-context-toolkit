---
description: Rules for coordinating MCP Task Orchestrator tools and Superpowers skills in this project.
paths: ["**/*"]
---

# Usage Rules: MCP Task Orchestrator + Superpowers

You are an AI assistant that uses **MCP Task Orchestrator (EchoingVesper)** as the top‑level planner for this project, while **Superpowers** (Anthropic plugin / skills) may be used only as disciplined, pattern‑enforcing helpers inside specific tasks.

Follow these rules in every session that mentions `mcp-task-orchestrator`, `task-orchestrator`, or `Superpowers`.

---

## 1. Overall orchestration model

- **MCP Task Orchestrator owns the global task graph.**
    - Always start complex work by calling orchestrator tools (e.g., `orchestrator_plan_task`, `get_next_item`, `get_status`, `complete_subtask`).
    - Maintain a clear hierarchy of:
        - `goal` → `stories` → `tasks` → `subtasks`.

- **Superpowers does not replan the project.**
    - Superpowers skills (e.g., `writing-plans`, `test-driven-development`, `subagent-driven-development`) must be **invoked only inside a task that the Task Orchestrator already created**.
    - Do not start a Superpowers‑level “multi‑agent” or “subagent‑driven‑development” plan unless it is explicitly listed as a subtask in the orchestrator’s graph.

---

## 2. Role‑based usage

### Architect tasks

- When the current task is `Architect: design API / schema / module layout`:
    - You may use **Superpowers `writing-plans`** to generate a detailed design plan inside the current task.
    - You must respect the configured "plansDirectory" in the `.claude/settings.json`.
    - You must **return the plan** to the Task Orchestrator (e.g., by describing it in a structured format) and **not** treat `writing-plans` as the final authority.

- Never:
    - Let `writing-plans` redesign the project roadmap after the orchestrator has set the goal.
    - Run `writing-plans` in isolation, outside of a Task Orchestrator‑managed session.

### Implementer tasks

- When the current task is `Implementer: implement module X with TDD`:
    - You must use **Superpowers `test-driven-development`** for that file/module if enabled by the project config.
    - You must:
        - Write a failing test.
        - Write the minimal code to pass.
        - Iterate within the same subtask.

- Do not:
    - Start a second TDD‑style loop outside of the current subtask.
    - Let Superpowers choose which files to touch; the Task Orchestrator sets the scope (e.g., “only `auth/`”).

### Review / deep‑research tasks

- When the current task is `Reviewer: run a subagent‑driven review` or `Researcher: explore design options`:
    - You may use **Superpowers `subagent-driven-development`** for that specific task.
    - You must:
        - Keep the findings and recommendations explicit and concrete.
        - Write the results into a file or the orchestrator’s task notes.

- Never:
    - Let `subagent-driven-development` spin off its own “parallel” project plan that contradicts the orchestrator’s goal.

---

## 3. MCP vs Superpowers boundaries

- **Only one “planner” at a time**
    - If Superpowers is running a skill (e.g., TDD, subagent‑driven‑development), you must **not** simultaneously treat the Task Orchestrator as “re‑planning the entire project.”
    - The Task Orchestrator is allowed to:
        - Create new tasks.
        - Track status.
        - Ask for reports.
    - But while Superpowers is executing a skill, the orchestrator must **not** change the ground‑truth of the current subtask (e.g., rewrite the API spec) without explicit handover.

- **No double‑agent workflows**
    - Do not run:
        - `MCP Task Orchestrator → multi‑agent role loop` **and**
        - `Superpowers → subagent‑driven‑development loop`
          over the same goal at the same time.
    - If you need multi‑agent behavior, pick one or the other, and encode the decision in the `CLAUDE.md` or `rules.md`.

---

## 4. Tool‑call discipline

- **Always call orchestrator tools first** for high‑level control:
    - `orchestrator_plan_task` when a new feature or refactoring is requested.
    - `get_next_item` and `get_status` at the start of a session to load the current workload.
    - `complete_subtask` with explicit artifacts when a task ends.

- **Only then**, when the orchestrator’s task description says “use TDD” or “run a subagent‑driven review”, invoke the relevant **Superpowers skill**.

- **Never** call Superpowers patterns in “quick‑one‑off‑edit” mode:
    - Simple edits (e.g., formatting, renaming, small fixes) should skip Superpowers unless explicitly required.
