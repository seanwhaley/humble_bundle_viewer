---
name: json-standards
description: "Use when designing API payloads, JSON response envelopes, resource structures, filtering, pagination, or machine-readable interchange formats."
---

# JSON Standards

Use this skill for API and structured data design, especially when consistency matters across producers and consumers.

## Apply this skill when

- designing or revising JSON payloads
- shaping collection responses, pagination, or filtering
- standardizing error payloads
- deciding naming and envelope conventions for machine-readable data

## Working principles

1. **Prefer predictable structures**
   - keep keys, nesting, and error shapes consistent
2. **Design around resources and workflows**
   - use nouns and explicit state, not ad-hoc action payloads
3. **Be explicit about metadata**
   - include pagination, totals, or links when they matter to clients
4. **Keep sensitive data out of payloads**
   - never expose secrets, signed URLs, or unnecessary internal details

## Checklist

- [ ] payload naming is consistent
- [ ] collections include clear metadata when needed
- [ ] errors use structured machine-readable shapes
- [ ] backend and frontend expectations stay aligned

## Use alongside

- `fastapi-backend` for API implementation details
- `pydantic-modeling` for Python-side validation and serialization
- `config-best-practices` when JSON is also used for configuration or artifacts
