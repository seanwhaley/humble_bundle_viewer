---
name: fastapi-backend
description: "Use when updating `backend/app/**` FastAPI routes, request or response models, backend services, background tasks, or API behavior for the viewer portal."
---

# FastAPI Backend

Use this skill when a task centers on the viewer backend or API contract design.

## Apply this skill when

- adding or modifying FastAPI routes
- changing request or response payloads
- refactoring backend service wiring
- handling background tasks or long-running backend operations

## Repository-specific focus

- keep routing in `backend/app/api/`, business logic in `backend/app/services/`, and typed schemas in `backend/app/models/`
- prefer explicit request models and `response_model`
- keep secrets and sensitive operational details out of API responses and logs
- move blocking work off async request handlers when needed

## Checklist

- [ ] request and response models are explicit and safe
- [ ] route handlers delegate business logic to services
- [ ] long-running work is handled asynchronously or off-thread
- [ ] docs and tests were updated when API behavior changed

## Use alongside

- `viewer-portal-workflows` for cross-cutting backend/frontend viewer changes
- `pydantic-modeling` for schema design and validation
- `json-standards` for payload structure decisions
