# UX Phase 0–1: audit and the design system

**Branch** `ux/01-audit-and-design-system` → **base** `ux/00-groundwork-docs`

## What changes, in plain words

Before any screen changed, we photographed every page in both themes and wrote down what was wrong (AUDIT.md). Then we built the shared pieces every screen now uses: one set of colours for light and dark, one type scale, four kinds of button, the status labels, date pickers, side panels, confirmations, empty and error states, and the 'availability last checked' line. Screens look almost the same after this PR; the next PRs use these pieces. Kept separate from the screen PRs as the brief asks.

## Checklist items this closes (brief §12.4 / §13)

- [x] Contrast of every token pair recorded (DESIGN_TOKENS.md)
- [x] All thirteen statuses through StatusPill with the §2.3 labels
- [x] `:focus-visible` only
- [x] Groundwork for: no raw colours, one gold primary, designed empty/error/stale states

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### dev-system

| Before | After |
| --- | --- |
| _new state, no before_ | ![after dev-system light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/01-audit-and-design-system/docs/ux/after/dev-system/light-1440.png?raw=true) |
| _new state, no before_ | ![after dev-system dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/01-audit-and-design-system/docs/ux/after/dev-system/dark-390.png?raw=true) |


## How to check it

- `/dev/system` in both themes: every component, status and state.
- `npm test`, `npx eslint .`

## Commits (4)

- 332f484 UX redesign Phase 0: DESIGN.md reconciled to brief §4, route map, component inventory, before-screenshots (31 routes × 2 themes × 3 widths), audit base, decisions log, screenshot script
- 71ef777 UX Phase 0: complete AUDIT.md with per-route critique scores and technical audit; re-capture the four admin-only routes
- 9ceed0f UX Phase 1: brief §4.1 role tokens for both themes, type ramp, three radii, four button kinds, StatusPill/SlaBadge/Pill on one status vocabulary, DataTable with card mode, raw-colour lint rule, measured DESIGN_TOKENS.md, /dev/system gallery
- 4426b34 UX Phase 1 complete: date fields on react-day-picker, Sheet/Dialog/ConfirmDialog, Toast, EmptyState, ErrorState, SyncState, HelpTip, StepTracker, welcome card; brief §13 recorded; dashboard dead links removed (manual search form)

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
