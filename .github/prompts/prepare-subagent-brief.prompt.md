---
name: prepare-subagent-brief
description: Build a scoped brief for a subagent so the main chat agent can delegate exploration or research without losing task ownership.
argument-hint: "Describe the task you want to delegate and the files or outcomes you care about"
---

Use this prompt when the main chat agent should delegate a focused task to a subagent while keeping ownership of the implementation and validation.

For the described task, produce a subagent brief with these sections:

1. **Goal** — the exact question or task for the subagent to handle
2. **Scope** — which files, folders, artifacts, or product surfaces the subagent should inspect
3. **Constraints** — security, privacy, non-goals, or repo rules the subagent must respect
4. **Expected output** — the specific structure the subagent should return, such as:
   - impacted files
   - key findings
   - open questions
   - recommended next steps
5. **Stop conditions** — what the subagent should avoid doing or when it should stop instead of broadening scope

Default coordination model:

- the **main agent** owns planning, edits, validation, and the final answer
- the **subagent** owns scoped discovery, inventory, or targeted research
- the result should be concise enough for the main agent to integrate without repeating the search from scratch