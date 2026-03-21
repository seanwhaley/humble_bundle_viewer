---
name: viewer-portal-workflows
description: "Use when working on the HB Library Viewer website capabilities, including the viewer portal, command center, setup flows, browser-managed downloads, advanced local sync, and full-stack backend/frontend coordination. Triggers for viewer routes, React pages, FastAPI APIs, local sync UI, command center actions, and website behavior changes."
---

# Viewer Portal Workflows

Use this skill when the task spans the local website experience rather than a single backend-only or frontend-only concern.

## Apply this skill when

- changing viewer portal capabilities or behavior
- updating `frontend/src/**` pages, routes, hooks, or components tied to viewer workflows
- updating `backend/app/**` APIs or services that power the viewer
- modifying command center actions, setup flows, browser download flows, or advanced local sync UX
- coordinating changes across backend, frontend, docs, and tests for website-facing features

## Repository-specific focus

The website is not a generic CRUD app. It is a local-first operational surface for:

- browsing normalized Humble Bundle library artifacts
- running capture and maintenance tasks through the command center
- triggering browser-managed downloads safely
- performing advanced local sync for eBooks and audiobooks
- preserving strict boundaries around `_simpleauth_sess`, signed URLs, and local artifacts

## Key files and areas

- Backend routes: `backend/app/api/**`
- Backend services: `backend/app/services/**`
- Backend models: `backend/app/models/**`
- Frontend pages: `frontend/src/app/**`
- Frontend components: `frontend/src/components/**`
- Frontend data/hooks: `frontend/src/data/**`
- Viewer docs: `docs/guides/viewer-portal.md`
- CLI integration docs when viewer behavior overlaps command center or maintenance flows: `docs/guides/cli-reference.md`

## Working principles

### 1. Keep backend/frontend contracts explicit

- use typed request/response models on the backend
- keep frontend data access in hooks or data modules, not presentational components
- update both sides when payloads or route semantics change

### 2. Protect secrets and local-only data

- never expose `_simpleauth_sess` to the frontend
- never log or surface signed download URLs unnecessarily
- keep auth and sensitive I/O server-side

### 3. Respect the local-first product model

- the viewer should orchestrate local workflows, not become a hosted multi-user service
- browser downloads and local sync flows should remain explicit and user-controlled
- route or UI changes should preserve the current privacy model

### 4. Treat website changes as cross-cutting changes

When website capabilities change, check all of these:

- backend route/service/model impact
- frontend route/component/data-hook impact
- docs impact in `docs/guides/` and `README.md` if user-visible
- test impact in backend tests and any frontend/webapp validation flows

## Recommended workflow

1. Identify the user-facing website workflow being changed
2. If the task spans many routes or files, use a read-only exploration subagent first to map the backend/frontend surfaces and return a concise impact summary
3. Trace the backend route/service and frontend route/component boundaries
4. Update typed contracts first if payloads change
5. Implement the backend and frontend changes together in the main agent
6. Update docs for any user-visible workflow shift
7. Validate with the relevant automated tests and a local viewer smoke test

## Checklist

- [ ] Backend request and response models are still correct
- [ ] Frontend data hooks align with backend contracts
- [ ] No secrets or signed URLs leak to the client or logs
- [ ] Any subagent exploration output was reconciled by the main agent before edits were finalized
- [ ] Viewer docs were updated when the workflow changed
- [ ] Relevant tests were updated
- [ ] Local browser smoke testing was considered for route/UX changes

## Use alongside

- `fastapi-backend` for backend route and service discipline
- `react-frontend` for component and hook conventions
- `webapp-testing` for viewer validation and browser testing