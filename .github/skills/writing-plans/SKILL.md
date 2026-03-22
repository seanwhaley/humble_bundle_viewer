---
name: writing-plans
description: "Use when a change needs a tracked multi-step implementation plan, effort documentation under `docs/development/work-efforts/`, or a clear task-by-task execution sequence before coding."
---

# Writing Plans

Use this skill when the work is large enough to benefit from an explicit plan before implementation starts.

## Apply this skill when

- breaking a complex feature into ordered tasks
- preparing a tracked effort under `docs/development/work-efforts/`
- mapping code, tests, docs, and validation work before editing
- turning vague requirements into implementation slices

## Repository-specific focus

- active tracked efforts live under `docs/development/work-efforts/<effort-name>/`
- tracked efforts must use exactly `current-vs-to-be.md`, `prd.md`, and `status.md`
- plans should be Copilot-first and should not depend on Claude-specific workflow assumptions
- keep steps small, testable, and easy to verify

## Planning principles

1. write for an implementer who has limited local context
2. include exact files, validation steps, and documentation impacts
3. prefer small ordered tasks over giant phases with vague intent
4. update `status.md` as work progresses

## Checklist

- [ ] the effort name and scope are explicit
- [ ] impacted files, tests, and docs are identified
- [ ] the three required work-effort files are used when tracking active work
- [ ] steps are specific enough to execute without rediscovery

## Use alongside

- `doc-standards` for polished spec or proposal writing
- `test-driven-development` when the plan should enforce a test-first implementation rhythm
