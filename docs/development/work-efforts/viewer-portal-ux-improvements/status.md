# Status — Viewer Portal UX Improvements

## Status summary

- **State**: In progress
- **Started**: 2026-03-19
- **Last updated**: 2026-03-30
- **Owner**: GitHub Copilot implementation pass
- **Implementation state**: First seven implementation slices completed for key triage, download-route empty-state guidance, shared key inventory polish, tools-page density cleanup, expiring-key follow-up actions, config-driven expiring-key focus refinement, dense-route cleanup for `Software` plus `Command Center`, and scan-first cleanup for the remaining media routes; broader effort remains in progress

## Scope

Track the UX improvement effort for the HB Library Viewer website based on a live route review of the current local portal.

## Deliverables

- [x] Create `current-vs-to-be.md`
- [x] Create `prd.md`
- [x] Create `status.md`
- [x] Rank implementation tasks into concrete route-level slices
- [x] Implement prioritized UX changes included in the current integrated pull-request recommendation
- [x] Validate changed routes included in the current integrated pull-request recommendation with browser review and frontend build/tests
- [ ] Fold completed outcomes into canonical viewer docs and remove this effort folder when no longer needed

## Integrated implementation plan

Use this section as the source of truth for deciding which requirements are already covered,
which changes must ship together in the current pull request, and which work is intentionally
held for future pull requests. The goal is to remove any ambiguity about whether a requirement
was implemented previously, is part of the current integrated recommendation, or is still
planned work.

### Covered work in the repository state

- the current integrated viewer batch already includes the implemented route slices for
  keys, downloads empty-state follow-up, Setup/Schema/Command Center density cleanup,
  `Software`, and the media routes
- the remaining browser-storage implementation is already present in code, but its two
  required validation checks are still open and must be completed before that effort can
  be treated as fully closed

### Current pull request plan

This pull request should remain a single integrated viewer-portal UX batch containing the
already-made but still-unmerged closeout work across the related efforts:

- styling and route closeout
  - `frontend/src/app/routes/Overview.tsx`
  - `frontend/tests/integration/app/routes/Overview.test.tsx`
  - matching status/doc updates
- Setup and Command Center closeout
  - `frontend/src/app/routes/LibrarySetup.tsx`
  - `frontend/src/app/routes/CommandCenter.tsx`
  - `frontend/tests/unit/routes/LibrarySetup.test.tsx`
  - `frontend/tests/unit/routes/CommandCenter.behavior.test.tsx`
- route-rendering and browser-review fixes discovered after the integrated review
  - `frontend/src/main.tsx`
  - `frontend/src/app/routes/Structure.tsx`
- dense-route cleanup for downloads/media
  - `frontend/src/app/routes/Software.tsx`
  - `frontend/src/app/routes/Ebooks.tsx`
  - `frontend/src/app/routes/Audiobooks.tsx`
  - `frontend/src/app/routes/Videos.tsx`
  - `frontend/tests/integration/app/routes/Software.test.tsx`
  - `frontend/tests/integration/app/routes/Ebooks.test.tsx`
  - `frontend/tests/integration/app/routes/Audiobooks.test.tsx`
  - `frontend/tests/integration/app/routes/Videos.test.tsx`
- integrated docs/status alignment
  - `docs/guides/viewer-portal.md`
  - `docs/development/work-efforts/viewer-browser-storage/status.md`
  - this `status.md`
- required closeout still expected before the pull request is considered fully complete
  - finish the two pending validation requirements in `viewer-browser-storage/status.md`

### Future planned pull requests

Do **not** add the following work to the current pull request recommendation. These belong in
future planned pull requests so the current batch stays reviewable and traceable:

- **Future PR 1 — overview polish**
  - `Viewer Home`
    - reduce top-of-page density further
    - make chart and summary interactions more explicit
    - preserve accepted navigation and word-cloud decisions while improving prioritization
  - `Sales Overview`
    - keep the compact filter treatment
    - improve the first-screen executive summary and next-action guidance before deeper charts
  - any follow-on current-sales subtype refinement that depends on the `Sales Overview` pass
- **Future PR 2 — effort closeout**
  - remove temporary work-effort folders only after all tracked requirements are implemented,
    validated, and reflected in canonical docs

## Remaining work by active work-effort folder

### `viewer-browser-storage`

- remaining implementation work: none
- remaining requirement work:
  - validate no credentials are persisted to browser storage after capture
  - validate graceful fallback when browser storage is unavailable
- current-pull-request expectation: complete and record those two validations before calling
  the effort fully implemented
- future-pull-request expectation: none unless the current pull request is intentionally split

### `viewer-portal-ux-improvements`

- remaining implementation work for the current pull request: none beyond documenting and
  validating the already-completed slices included above
- future planned implementation work:
  - Future PR 1: `Viewer Home`, `Sales Overview`, and any small current-sales follow-on
    refinements that emerge from those two passes
- future planned documentation/cleanup work:
  - Future PR 2: remove the temporary work-effort folder only after all requirements are fully
    closed and canonical docs reflect the final product state
- final closeout requirement:
  - once the future slices are done and canonical docs are updated, remove the temporary
    work-effort folder instead of letting it linger as an active plan artifact

## Initial implementation slice

Start with the smallest high-value improvements that reinforce accepted design decisions without reopening the overall information architecture:

1. `Expiring keys`
   - add quick triage scopes for urgent subsets
   - keep urgency-first ordering stronger within the table data
   - avoid changing the accepted route naming or broader key-route structure
2. `Other downloads`
   - keep the stable empty-state route behavior
   - add clear follow-up actions to the dedicated download routes instead of redirecting automatically

### Initial files in scope

- `frontend/src/app/routes/ExpiringKeys.tsx`
- `frontend/src/app/routes/Downloads.tsx`
- `frontend/src/components/DownloadRouteEmptyState.tsx`
- `frontend/src/data/selectors.ts`
- `frontend/src/data/selectors.test.ts`
- `docs/guides/viewer-portal.md`

## Recent progress

Completed the first contained implementation slice.

### Implemented

- `Expiring keys`
  - added quick scope buttons for `All`, `Needs action`, `Expired`, `Next 7 days`, `Next 30 days`, and `Needs reveal`
  - strengthened urgency-first table ordering so unresolved rows sort ahead when urgency is otherwise tied
  - changed the in-page section heading from a duplicated route title to `Urgent key triage`
- `Other downloads`
  - changed the in-page section heading from `Other Downloads` to `Download inventory`
  - preserved the stable empty-state route behavior
  - added follow-up links to `Software`, `Videos`, `Ebooks`, and `Audiobooks`
- shared/frontend support
  - added selector helpers and tests for expiring-key quick-scope logic
  - updated `docs/guides/viewer-portal.md` to reflect both route changes

### Validation completed for this slice

- frontend targeted tests
  - `npm test -- src/data/selectors.test.ts src/utils/downloads.test.ts`
  - result: 15 tests passed
- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed the `Expiring keys` route renders the new quick-scope controls
  - confirmed the `Other downloads` empty state now shows dedicated-route follow-up links

Completed the second contained implementation slice for the shared key inventory routes.

### Implemented in the second slice

- shared/frontend support
  - added `filterKeyInventoryByScope`, `buildKeyInventorySummary`, and `sortKeyInventoryForTriage` in `frontend/src/data/selectors.ts`
  - added a reusable `KeyInventorySummaryStrip` component for compact route-level inventory summaries
  - expanded selector tests to cover the shared key inventory helper behavior
- `Steam keys`
  - added a compact summary strip for total inventory, reveal backlog, redeemable rows, and expiring rows
  - added quick scopes for `All`, `Needs reveal`, `Revealed`, `Redeemable`, `Expiring`, and `Direct redeem`
  - renamed the visibility yes/no column from `Claimed` to `Revealed`
  - strengthened default triage ordering so urgent or not-yet-revealed rows surface first
  - normalized expiry display so expired rows render as `Expired` instead of `0 days`
- `Non-Steam keys`
  - added a matching summary strip plus quick scopes for `All`, `Needs reveal`, `Revealed`, `Redeemable`, `Instructions`, and `Expiring`
  - renamed the visibility yes/no column from `Claimed` to `Revealed`
  - normalized key-type table labels through the shared selector formatting
  - removed the low-value `Steam App ID` column from the non-Steam inventory table
  - aligned expiry display and default triage ordering with the Steam route
- docs
  - updated `docs/guides/viewer-portal.md` to document the new key-page summaries, quick scopes, and `Revealed` terminology

### Validation completed for the second slice

- frontend targeted tests
  - `npm test -- src/data/selectors.test.ts`
  - result: 8 tests passed
- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed `/steam-keys` renders the new summary strip, quick scopes, `Revealed` column label, and normalized expired-state display
  - confirmed `/non-steam-keys` renders the matching summary strip and quick scopes, drops the `Steam App ID` column, and filters correctly when `Instructions` is selected

Completed the third contained implementation slice for the Tools section pages.

### Implemented in the third slice

- `Setup`
  - replaced the duplicate in-page route title treatment with a clearer task-first heading
  - added workflow guidance cards so fresh capture, saved-file selection, and follow-up tools are easier to distinguish before the form fields begin
  - added a current-workflow explainer block that changes with the selected mode
  - reframed the optional download settings as a secondary scope step instead of making them look like core required fields
- `Command Center`
  - replaced the single undifferentiated card wall with grouped sections for guided workflows, rebuilds/exports, and metadata enrichment
  - added top-level page framing that explains the default-first versus advanced-override model
  - moved path-heavy command parameters behind expandable advanced sections so one-click defaults stay visible first
- `Schema`
  - replaced the duplicate route-title treatment with a task-first heading
  - added summary context for product and subproduct counts plus a callout that explains when to use Blueprint versus Inspector
  - added focus buttons for `All branches`, `Products`, `Subproducts`, and `Metadata`
  - added a `Library Metadata` inspector sample alongside product and subproduct JSON views
- docs
  - updated `docs/guides/viewer-portal.md` to document the new setup guidance, command-center grouping, and schema focus/inspector behavior

### Validation completed for the third slice

- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed `/setup` renders the new workflow guidance cards, next-step links, and current-workflow explainer block
  - confirmed `/commands` renders the new grouped sections and expands advanced command settings when selected
  - confirmed `/structure` renders the new summary strip, focus buttons, and `Library Metadata` inspector sample

Completed the fourth contained implementation slice for the remaining `Expiring keys` family polish.

### Implemented in the fourth slice

- `Expiring keys`
  - added the shared compact summary strip so the urgency route now matches the broader key-family visual rhythm
  - added an in-row `Action` control that exposes `Redeem` or `Instructions` links directly from the urgent table when Humble provides them
  - corrected the top-level inventory summary language from `redeemed` to `revealed` so the route describes viewer-known key visibility accurately
  - updated the route guidance copy so the next action is to use quick scopes first and row actions second
- shared/frontend support
  - added a small shared helper for choosing the compact redemption action label from row metadata
  - expanded selector tests to cover the new action-label helper
- docs
  - updated `docs/guides/viewer-portal.md` to document the new Expiring Keys summary strip and in-row action affordances

### Validation completed for the fourth slice

- frontend targeted tests
  - `npm test -- src/data/selectors.test.ts`
  - result: 9 tests passed
- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed `/expiring-keys` renders the shared summary strip, updated revealed wording, and the new in-row `Action` affordance when loaded from the working app shell and navigated in-app
  - result: passed

Completed the fifth contained implementation slice for config-driven expiring-key action focus.

### Implemented in the fifth slice

- backend config and API
  - added `viewer.assume_revealed_keys_redeemed`, `viewer.ignore_revealed_status_for_expired_keys`, and `viewer.ignore_revealed_status_for_unexpired_keys` to the runtime config model and committed `backend/config.yaml` defaults
  - expanded `/api/viewer/config` so the frontend can consume the reveal-policy behavior without hard-coded assumptions
- shared/frontend support
  - added a reveal-policy-aware expiring-key action summary helper for counting only still-open windows while keeping expired rows available as reference
  - updated expiring-key scope counts and filters so `Needs action` now prioritizes only unexpired actionable rows by default
  - switched the shared layout badge and urgent banner to the new open-action count instead of treating already-expired rows as the primary alert
- `Expiring keys`
  - added an explicit open-window callout that centers the route on unexpired keys that can still be claimed
  - limited the in-row `Action` affordance to rows that remain actionable under the active reveal policy and labeled expired/handled rows accordingly
  - reframed summary-strip metrics so open actions and unexpired reveal backlog are easier to scan than expired history
- docs
  - updated `docs/guides/viewer-portal.md` to document the new open-action emphasis and configurable reveal-policy defaults

### Validation completed for the fifth slice

- frontend targeted tests
  - `npm test -- src/data/selectors.test.ts`
  - result: 12 tests passed
- backend targeted tests
  - `backend/tests/unit/app/api/test_viewer_config_api.py`
  - `backend/tests/unit/hb_library_viewer/test_config.py`
  - `backend/tests/integration/test_config_loading.py`
  - result: 226 tests passed

Completed the sixth contained implementation slice for the remaining dense-route cleanup pass.

### Implemented in the sixth slice

- `Software`
  - replaced the always-on top control wall with a compact browse-first summary card
  - moved route-level filters, bulk downloads, and managed sync behind explicit toggles so the table remains the primary first-screen task
  - scoped bulk variant choices to the currently selected rows so the variant picker stays relevant for the active selection instead of listing every software file type at once
- `Command Center`
  - replaced the three-peer top guidance cards with a single `Start here` summary strip that explains the intent split between guided workflows, rebuilds/exports, and metadata enrichment
  - added direct jump links to the three command groups so users can move to the right section without scanning the full route first
- docs and tests
  - added focused integration coverage for the new `Software` progressive-disclosure behavior
  - updated `Command Center` route tests to cover the new section-jump affordances
  - updated `docs/guides/viewer-portal.md` to document both route changes

### Validation completed for the sixth slice

- frontend targeted tests
  - `npm test -- tests/integration/app/routes/Software.test.tsx tests/integration/app/routes/CommandCenter.test.tsx tests/unit/routes/CommandCenter.behavior.test.tsx`
  - result: 13 tests passed
- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed `/software` renders the new browse-first summary card with on-demand toggles for filters, bulk downloads, and managed sync
  - confirmed `/commands` renders the new `Start here` summary and direct section jump links
  - result: passed

Completed the seventh contained implementation slice for the remaining media-route cleanup pass.

### Implemented in the seventh slice

- `Ebooks`
  - upgraded the existing top control bar into a compact summary card so the route reads as reader-first instead of file-first
  - scoped bulk format choices to the currently selected rows so the route-level picker stays relevant to the active selection
- `Audiobooks`
  - replaced the always-on filter, bulk-download, and managed-sync wall with the same explicit disclosure pattern used on `Software`
  - added a compact summary card that clarifies the browse-first flow before the table begins
  - scoped bulk format choices to the currently selected rows
- `Videos`
  - applied the same browse-first summary and disclosure model so filters, bulk downloads, and managed sync no longer compete equally with the table
  - scoped bulk format choices to the currently selected rows
- docs and tests
  - added focused integration coverage for `Ebooks`, `Audiobooks`, and `Videos`
  - updated `docs/guides/viewer-portal.md` to document the shared media-route behavior

### Validation completed for the seventh slice

- frontend targeted tests
  - `npm test -- tests/integration/app/routes/Ebooks.test.tsx tests/integration/app/routes/Audiobooks.test.tsx tests/integration/app/routes/Videos.test.tsx tests/integration/app/routes/Software.test.tsx`
  - result: 8 tests passed
- frontend production build
  - `npm run build`
  - result: passed
- browser smoke checks
  - confirmed `/ebooks` renders the new reader-first summary card and keeps filters, bulk browser downloads, and managed sync behind explicit toggles
  - confirmed `/audiobooks` renders the new listen-first summary card and keeps filters, bulk browser downloads, and managed sync behind explicit toggles
  - confirmed `/videos` renders the new watch-first summary card and keeps filters, bulk browser downloads, and managed sync behind explicit toggles
  - result: passed

## Next candidate slice — continue dense-route cleanup

With the key-family follow-up, dense-route cleanup for `Software`, `Command Center`, and the media routes now implemented, the next slice should move to the remaining overview-level polish on `Viewer Home` and `Sales Overview`.

### Recommended shared polish

- continue applying scan-first summary/context patterns to routes that still read as dense dashboards instead of guided pages
- keep action-heavy controls grouped separately from browse/reporting surfaces as the remaining dense routes are simplified
- preserve the shared key-route language introduced in the completed slices rather than reopening that family again immediately

### Route-specific polish to consider

- `Viewer Home`
  - keep reducing top-of-page density while preserving the accepted navigation and word-cloud decisions
  - make the most important interactive affordances more explicit without reintroducing duplicate shortcuts
- `Sales Overview`
  - keep the compact filter treatment, but make the first-screen summary and next actions easier to interpret before the deeper charts begin

## Evidence gathered

The following routes were rendered during the review that informed this effort:

- `/`
- `/current-bundles`
- `/venue/overview`
- `/venue/bundles/games`
- `/venue/bundles/books`
- `/venue/bundles/software`
- `/venue/choice`
- `/orders`
- `/category/bundle`
- `/steam-keys`
- `/non-steam-keys`
- `/expiring-keys`
- `/downloads`
- `/software`
- `/videos`
- `/ebooks`
- `/audiobooks`
- `/setup`
- `/commands`
- `/structure`

## Key findings

### Strengths

- Navigation grouping is clearer and more consistent than earlier revisions.
- `Viewer Home` improved meaningfully after the recent cleanup and urgency work.
- The expiring-keys badge is a strong, high-value signal.
- `Purchases` already has a good conceptual split between comprehension and row-level inspection.

### Accepted decisions to preserve during implementation

- Keep `Viewer Home` and `Sales Overview` naming as-is.
- Keep current-sales navigation split into overview, choice, and bundle-type routes.
- Do not reintroduce duplicate current-sales shortcuts on `Viewer Home`.
- Preserve the compact `Sales Overview` filter treatment.
- Build on the accepted expiring-key badge and banner urgency treatment.
- Refine the purchase-theme word cloud rather than treating it as expendable.

### Problems to solve

- Dense routes still place too many controls at the same priority.
- Several pages repeat their title hierarchy.
- Some routes explain state without steering the user to the next action.
- Key routes still need faster triage paths.
- `Software` and `Command Center` are especially feature-rich but visually crowded.

## Recommended implementation order

1. Cross-route polish
   - heading cleanup
   - empty-state follow-up actions
   - alias/canonical route decisions that preserve accepted naming and split-route behavior
2. Keys triage improvements
   - quick scopes
   - urgency-first ordering
   - unresolved-state prioritization
3. Software and media simplification
   - progressive disclosure
   - clearer browse vs action separation
4. Command Center and Setup clarity
   - group by intent/risk
   - collapse advanced parameters
   - expose run/output context better
5. Current sales and Viewer Home refinement
   - summary-first ordering
   - better quick filters
   - clearer interactive affordances

## Risks and dependencies

- Media-route improvements depend partly on metadata quality already present in the artifact set.
- Some route simplifications may require light backend contract changes if the frontend needs more explicit aggregates or grouped data.
- Any command-center UX changes must preserve local-first behavior and avoid exposing secrets or sensitive artifact details.

## Validation expectations

Before marking this effort complete:

- impacted routes should be rendered and reviewed locally
- changed frontend behavior should have targeted test coverage where practical
- `frontend` production build should pass
- `docs/guides/viewer-portal.md` should reflect the final user-visible workflow changes

## Next step

Shift the next contained pass to `Viewer Home` and `Sales Overview`, using the same scan-first framing and prioritization patterns that now span the key routes, the media routes, `Software`, and the Tools pages.
