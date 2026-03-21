---
name: webapp-testing
description: "Use when validating the local viewer web app through browser behavior, Playwright flows, route checks, screenshots, logs, or other UI-level verification."
---

# Web App Testing

Use this skill when the task needs browser-level validation of the local viewer experience.

## Apply this skill when

- testing viewer routes or UI flows in the browser
- debugging rendered behavior or client-side interaction issues
- capturing screenshots, browser logs, or selector information
- validating a backend/frontend change through end-to-end interaction

## Repository-specific focus

- prefer the repository’s local startup helpers before inventing a new launch flow
- wait for the rendered app state before selecting elements on dynamic pages
- use browser validation to confirm workflow behavior, not to replace backend or unit tests
- keep auth secrets and sensitive payloads out of browser logs and captured outputs

## Recommended workflow

1. ensure the local app is running through the existing helper workflow when needed
2. inspect the rendered page before hard-coding selectors
3. exercise the user-facing path being changed
4. capture the smallest useful evidence: selector checks, logs, or screenshots
5. pair findings back to code and tests

## Checklist

- [ ] the target route or UI flow is clearly identified
- [ ] selectors are based on rendered state
- [ ] browser checks focus on user-facing behavior
- [ ] captured artifacts avoid secrets or sensitive local data

## Use alongside

- `viewer-portal-workflows` for website behavior changes
- `react-frontend` for component or route work
- `test-driven-development` when browser behavior is part of the change sequence
