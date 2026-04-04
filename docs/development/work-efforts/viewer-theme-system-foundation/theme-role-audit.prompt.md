# Viewer theme role audit prompt

Use this prompt with a read-only subagent when you want to verify that the viewer frontend still routes shared styling decisions through the centralized theme system.

## Prompt text

Audit the Humble Bundle viewer frontend for theme-system regressions.

Scope:
- `frontend/src/**`
- `frontend/tailwind.config.js`
- `frontend/src/styles/main.css`
- `frontend/src/styles/roles.ts`
- `frontend/src/app/theme/**`

Objectives:
1. Find any repeated route-level or component-level shell styling that should instead come from shared theme ownership.
2. Flag any reintroduced opacity-tuned common surfaces such as `bg-card/60`, `bg-muted/30`, `bg-background/70`, or similar route-owned replacements for standard panels.
3. Verify that shared cross-page concepts use the centralized system:
   - theme tokens in `main.css`
   - theme runtime in `frontend/src/app/theme/**`
   - primitive variants in shared UI components
   - shared role classes in `frontend/src/styles/roles.ts`
4. Distinguish legitimate exceptions from regressions:
   - acceptable: runtime scrims, overlays, positioning styles, measured layout styles, one-off status treatments tied to actual meaning
   - not acceptable: route-local common card/filter/disclosure/table/chart shells that duplicate an existing shared role
5. Return a concise report with:
   - confirmed compliant areas
   - concrete regression findings with file paths and line numbers
   - recommended shared-role or primitive updates when a new reusable role is actually needed

Output format:
- `Compliant`
- `Needs follow-up`
- `Suggested shared-role additions`
- `Low-risk cleanup opportunities`

Do not edit files. This is a read-only audit.