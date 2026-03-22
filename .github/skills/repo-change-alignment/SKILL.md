---
name: repo-change-alignment
description: "Use when a task spans backend, frontend, tools, docs, or `.github` and you need to map architecture boundaries, required validation, documentation updates, and security/privacy checks before or during implementation."
---

# Repo Change Alignment

Use this skill when a change crosses repository surfaces or when you need to translate a feature request into the right code, docs, tests, and safety updates.

## Apply this skill when

- a task touches more than one of: `backend/src/**`, `backend/app/**`, `frontend/**`, `tools/**`, `docs/**`, or `.github/**`
- you need to decide where new logic belongs before editing
- you need a checklist for required tests, docs, validation, and security follow-through
- you are reviewing a proposal and want to catch missing repo-specific follow-up work

## Repository-specific focus

This repository relies on a few durable habits that should be checked together:

- keep reusable logic in `backend/src/hb_library_viewer/**`
- keep FastAPI-specific adaptation in `backend/app/**`
- keep frontend data access in `frontend/src/data/**` and UI logic in `frontend/src/components/**` / `frontend/src/app/**`
- keep tools and reports explicit, local-first, and safe around `data/artifacts/**`
- keep `python -m hb_library_viewer` working and respect the 0.5s minimum request delay
- update docs and tests in the same change when behavior, contracts, or workflows shift

## Recommended workflow

1. Identify the touched surfaces and assign each change to the correct layer
2. Map the impacted tests and validation commands before editing
3. Map the docs or templates that should change with the code
4. Check for secret, artifact, and signed-URL exposure risk
5. Implement the smallest cohesive set of changes
6. Validate the touched surfaces and report any follow-up gaps explicitly

## Checklist

- [ ] New logic lives in the correct layer instead of being duplicated across adapters
- [ ] Backend/frontend contracts stay explicit and typed where applicable
- [ ] Required docs, templates, or examples were identified before implementation ended
- [ ] Tests and validation commands were chosen for the touched surfaces
- [ ] No cookies, signed URLs, or sensitive artifact payloads leaked into code, logs, docs, or reports
- [ ] `.github/**` changes were checked for README, CODEOWNERS, validator, and workflow/template sync when applicable

## Use alongside

- `viewer-portal-workflows` for website-facing cross-stack changes
- `project-tools-and-reporting` for tooling and artifact/report workflows
- `fastapi-backend` or `react-frontend` for surface-specific implementation details
- `writing-plans` when the task needs explicit sequencing before edits