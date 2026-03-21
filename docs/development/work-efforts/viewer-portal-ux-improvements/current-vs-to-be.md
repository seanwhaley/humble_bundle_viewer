# Viewer Portal UX Improvements — Current vs To-Be

## Purpose

This work effort captures the current UX state of the HB Library Viewer portal after a live route review on 2026-03-19 and defines the expected target state for a focused usability improvement pass.

The audience is maintainers implementing route, component, and workflow changes across the viewer portal.

## Scope

This effort covers the website experience for:

- `Viewer Home`
- `Current sales` routes
- `Purchases`
- `Steam`, `Non-Steam`, and `Expiring` key routes
- download and media routes (`Software`, `Videos`, `Ebooks`, `Audiobooks`, `Other`)
- `Setup`, `Command Center`, and `Schema`

This effort does not define backend model changes unless they are required to support UX behavior already implied by the existing portal.

## Current State

### Established design decisions to preserve

The following decisions were already made earlier in the viewer redesign and should be treated as constraints on this effort rather than open questions:

- Keep the `Current sales` information architecture split into dedicated routes:
  - `Sales Overview`
  - `Current Choice`
  - `Game Bundles`
  - `Book Bundles`
  - `Software Bundles`
- Keep `Viewer Home` as the route label for `/` and `Sales Overview` as the label for `/venue/overview`.
- Do not reintroduce duplicate current-sales shortcut links on `Viewer Home` when those destinations are already primary sidebar navigation items.
- Preserve the compact filter treatment on `Sales Overview` rather than regressing to a larger, noisier filter block.
- Preserve the expiring-key urgency model that now spans sidebar badge plus route-level warning banners.
- Keep the purchase-theme word cloud on `Viewer Home`; future work should refine its affordances and weighting rather than remove or replace it casually.

### What is already working well

- Navigation groups are now clearer and map well to user mental models: Viewer, Current sales, Purchases, Downloads, Keys, and Tools.
- `Viewer Home` is materially improved from the earlier version:
  - duplicate current-sales shortcuts were removed
  - non-interactive dashboard tiles no longer imply false click behavior
  - the expiring-keys urgency signal is stronger and more useful
  - the purchase-theme word cloud adds meaningful context next to recent purchases
- `Expiring` in the sidebar is one of the strongest route-level urgency indicators in the app.
- `Purchases` already frames the primary and secondary table modes more clearly than several other routes.
- Empty-state behavior on `Other downloads` is safe and honest.

### Current UX problems by route family

| Route family                                                       | Current behavior                                                     | UX concern                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Viewer Home (`/`)                                                  | Stronger than before, but still front-loads many sections            | The top of the page is still dense, and some chart interactions are not yet explicit enough for new users      |
| Current sales overview (`/venue/overview`)                         | Consolidated metrics, source cards, and multiple analytical charts   | The page is information-rich but still cognitively heavy; too much interpretation is required before action    |
| Current sales subtype routes (`/venue/bundles/*`, `/venue/choice`) | Distinct routes with tables and focused analysis                     | They are accurate but still read more like inspection sheets than decision-oriented pages                      |
| Purchases (`/orders`)                                              | Strong table with useful actions and mode switching                  | The page is button-heavy, visually noisy, and repeats some title hierarchy patterns                            |
| Keys (`/steam-keys`, `/non-steam-keys`, `/expiring-keys`)          | Strong urgency and good filtering surfaces                           | The routes still require too much manual triage before the most important rows are obvious                     |
| Software (`/software`)                                             | Powerful browsing, browser download, and managed local sync features | Too many controls share the same screen; the variant selectors are especially overwhelming                     |
| Media library routes (`/videos`, `/ebooks`, `/audiobooks`)         | Functional dense tables                                              | Discovery is still file-centric rather than reader/listener/viewer-centric                                     |
| Other downloads (`/downloads`)                                     | Honest empty state when no qualifying data exists                    | The route explains the absence but does not help the user pivot to the next useful route                       |
| Setup / Command Center / Schema                                    | Functional operational surfaces                                      | Internal-tool complexity leaks into the UX; risk levels and advanced parameters are not sufficiently separated |
| Alias and heading consistency                                      | Several routes have route title + near-duplicate in-page heading     | Pages feel repetitious and less polished than the underlying functionality deserves                            |

### Cross-cutting pain points

1. **Density over prioritization**
   - Several routes try to be dashboard, operations panel, and inspection table at the same time.
2. **Too many peer controls**
   - Bulk actions, advanced settings, filters, and table actions often appear at the same visual priority.
3. **Weak first-screen guidance on dense pages**
   - Some routes require reading the whole page before the user understands the intended first action.
4. **Uneven empty-state and route-state handling**
   - Some pages explain the current state well, while others still leave the user to infer the next best step.
5. **Duplicate title hierarchy**
   - A route header and an almost-identical page section title often appear together.

## Expected State

### Product-level expectations

The viewer portal should feel like a local-first decision tool, not just a collection of data-heavy screens. The expected experience is:

- action-first for urgent tasks
- progressively disclosed for advanced workflows
- consistent in headings, route purpose, and empty-state guidance
- fast to scan even when the underlying data is large
- explicit about which elements are interactive and what they do

### Expected state by route family

| Route family                    | Expected state                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewer Home                     | The first screen prioritizes urgency, recent activity, and current sales summary before deeper analytics, without reintroducing duplicate links to destinations already present in the sidebar. Interactive elements clearly advertise their behavior. Lower-priority analysis is collapsed or visually deprioritized.                                                        |
| Current sales overview          | The page remains the shared current-sales dashboard, with compact filters and an immediate executive summary before deeper bundle analysis. Chart help is inline or collapsible rather than requiring a long explanatory block. Quick filters make the page feel decision-oriented without collapsing the split-route information architecture back into one monolithic page. |
| Current sales subtype routes    | Each subtype route stays distinct and exposes a concise top summary plus quick filters such as all-new, expiring soon, and highest savings. The route helps users decide where to click next instead of only presenting data, but it should not duplicate the role of `Sales Overview`.                                                                                       |
| Purchases                       | The default mode remains ownership comprehension first, but row interactions become calmer and more predictable. Detail viewing is easier, secondary actions are less noisy, and filter/mode state remains stable during exploration.                                                                                                                                         |
| Keys                            | Key routes default to urgency-first triage and build on the existing sidebar badge plus banner treatment. Users can isolate expiring, unredeemed, unrevealed, and provider-specific keys with one click. The most important unresolved rows float to the top by default.                                                                                                      |
| Software                        | The route separates browsing, bulk download, and managed sync concerns so each workflow has a clearer path. Variant selection becomes easier to understand through staged or grouped controls.                                                                                                                                                                                |
| Media library routes            | eBook, audiobook, and video browsing use media-appropriate discovery cues such as author, series, narrator, duration, or category when metadata is available. They remain powerful for filtering without reading as raw file inventories.                                                                                                                                     |
| Other downloads                 | An empty route offers useful follow-up actions, such as links to populated download categories, instead of acting as a dead-end explanation. Stable direct links may continue to resolve to an empty state; this effort does not require forced auto-redirect behavior.                                                                                                       |
| Setup / Command Center / Schema | Operational routes distinguish safe analysis, maintenance, rebuild, and advanced actions clearly. Advanced parameters are tucked away until needed, and each command exposes its purpose, outputs, and latest run state more clearly.                                                                                                                                         |
| Heading / route consistency     | Each page has one clear route heading, with supporting section headings that add information instead of repeating the title. Canonical routes are preferred over ambiguous aliases.                                                                                                                                                                                           |

### Success criteria

This effort is successful when:

- major viewer routes are easier to scan above the fold
- urgent key and current-sales tasks require fewer manual filtering steps
- dense routes expose progressive disclosure instead of flat control walls
- empty routes provide helpful next steps
- title hierarchy is consistent across the portal
- route semantics are clearer, including any alias cleanup or redirect behavior

### Priority order for implementation

1. Reduce density and improve action prioritization on `Software`, `Command Center`, and the media routes.
2. Strengthen triage behavior on `Steam keys` and `Expiring keys`.
3. Refine `Viewer Home` first-screen prioritization and explicit interaction hints.
4. Simplify `Sales Overview` and current-sales subtype decision flows.
5. Clean up duplicate headings, empty-state actions, and alias behavior without undoing accepted route naming or the split current-sales navigation model.
