---
name: audit-frontend-style-consistency
description: Audit `frontend/src/**` for styling consistency drift, fix the issues using the centralized token/primitives system, and validate the resulting frontend changes.
argument-hint: "Describe the frontend scope, route family, or styling symptoms you want audited"
---

Use [AGENTS.md](../AGENTS.md), [Architecture boundaries](../instructions/architecture-boundaries.instructions.md), [Secrets and artifacts safety](../instructions/secrets-and-artifacts.instructions.md), [GitHub customizations instructions](../instructions/github-customizations.instructions.md), [React frontend](../skills/react-frontend/SKILL.md), and [Repo change alignment](../skills/repo-change-alignment/SKILL.md).

For the requested frontend scope:

1. Audit all affected files under `frontend/src/**` for styling consistency drift.
2. Look specifically for:
   - inconsistent table header/background/text treatment
   - inconsistent card or panel fills across analogous route sections (for example mixed use of `bg-card`, `bg-card/60`, `bg-background/80`, or `bg-muted/30` for the same UI role)
   - mixed KPI/stat-summary primitives across analogous pages (for example one route using `StatTile`, another using badge chips, and another using route-local `div` panels for the same summary role)
   - KPI rows that bypass the shared stat primitive in `frontend/src/components/StatTile.tsx` or an equivalent shared metric component
   - inconsistent section chrome text color across analogous pages (for example generic section eyebrows, icons, labels, or helper text using status colors instead of neutral foreground/muted tokens)
   - repeated class strings that should be centralized
   - hardcoded palette values in `.ts` / `.tsx`
   - inline React `style={{...}}` presentation styles that should be classes or shared helpers
   - bespoke route-level visual patterns that should use semantic tokens or shared UI primitives
   - route-local card families or nested summary cards that visually drift from the reference route shells in `Overview.tsx`, `LibrarySetup.tsx`, and `CommandCenter.tsx`
3. Preserve TypeScript-side styling only when it is truly runtime-driven, such as:
   - tooltip positioning
   - scroll locking
   - measured dynamic heights
   - chart token resolution for runtime libraries like ECharts
4. Fix the issues using the repository’s centralized styling system:
   - `frontend/src/styles/main.css`
   - semantic Tailwind tokens
   - shared UI primitives in `frontend/src/components/ui/**`
   - shared stat primitives such as `frontend/src/components/StatTile.tsx` for summary metrics and KPI grids
   - shared table helpers such as `frontend/src/components/ui/table.ts` when native tables are involved
   - shared chart helpers such as `frontend/src/components/charts/theme.ts` when chart colors are involved
    - reserve status-colored text (`text-status-*`) for real status or interaction emphasis; use neutral text tokens for generic section chrome unless the color communicates actual status
    - when comparing card fills, distinguish between:
       - primary route shells
       - nested summary/stat cards
       - interactive controls or disclosure chips
       and keep analogous roles visually consistent across pages
      - if a summary metric needs a new visual treatment, add it to the shared primitive or shared role layer instead of introducing route-local KPI markup
5. Re-scan the touched scope to confirm there are no similar hidden cases left behind.
6. Validate the changes with at least `npm run build`, and run targeted tests if the touched surface warrants them.

Return:

- files audited
- issues found
- fixes applied
- any style-like TypeScript retained and why
- validation results