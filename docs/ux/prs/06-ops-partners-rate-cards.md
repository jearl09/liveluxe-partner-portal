# UX Phase 2 · Ops Partners, Rate cards and Settings

**Branch** `ux/06-ops-partners-rate-cards` → **base** `ux/05-partner-screens`

## What changes, in plain words

Live Luxe administrators' screens for the partner organisations: a list with how each partner pays, its rate card, its people, open requests and anything overdue; a partner page with this year's numbers; and the rate cards with a timeline of versions. Publishing a new rate card opens a side panel with proper date pickers, tiers as rows, and a confirmation that says what it replaces and from when.

## Checklist items this closes (brief §12.4 / §13)

- [x] Rate card tiers use a row editor; publishing shows a confirmation (live preview: NEEDS_BACKEND #8)
- [x] No permanently inline forms (New partner, Publish version)

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### admin-partners

| Before | After |
| --- | --- |
| ![before admin-partners light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-partners/light-1440.png?raw=true) | ![after admin-partners light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-partners/light-1440.png?raw=true) |
| ![before admin-partners dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-partners/dark-390.png?raw=true) | ![after admin-partners dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-partners/dark-390.png?raw=true) |

### admin-partner

| Before | After |
| --- | --- |
| ![before admin-partner light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-partner/light-1440.png?raw=true) | ![after admin-partner light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-partner/light-1440.png?raw=true) |
| ![before admin-partner dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-partner/dark-390.png?raw=true) | ![after admin-partner dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-partner/dark-390.png?raw=true) |

### admin-rate-cards

| Before | After |
| --- | --- |
| ![before admin-rate-cards light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-rate-cards/light-1440.png?raw=true) | ![after admin-rate-cards light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-rate-cards/light-1440.png?raw=true) |
| ![before admin-rate-cards dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-rate-cards/dark-390.png?raw=true) | ![after admin-rate-cards dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-rate-cards/dark-390.png?raw=true) |

### admin-rate-card

| Before | After |
| --- | --- |
| ![before admin-rate-card light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-rate-card/light-1440.png?raw=true) | ![after admin-rate-card light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-rate-card/light-1440.png?raw=true) |
| ![before admin-rate-card dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-rate-card/dark-390.png?raw=true) | ![after admin-rate-card dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-rate-card/dark-390.png?raw=true) |

### admin-settings

| Before | After |
| --- | --- |
| ![before admin-settings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-settings/light-1440.png?raw=true) | ![after admin-settings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-settings/light-1440.png?raw=true) |
| ![before admin-settings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/before/admin-settings/dark-390.png?raw=true) | ![after admin-settings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/06-ops-partners-rate-cards/docs/ux/after/admin-settings/dark-390.png?raw=true) |


## How to check it

- Needs a Live Luxe admin or finance account. Open a partner, open Publish a new version, do not publish.

## Commits (1)

- b3d2190 UX Phase 2 · ops Partners, Rate cards, Settings: partners list with counts, payment mode, card in force, people, open requests, outstanding (danger when overdue) and last activity, New partner and Edit in Sheets; partner detail with chips, this year's numbers and people; rate cards list with tiers, waivers, validity warnings and scheduled versions; version timeline and a publish Sheet with date pickers, inclusive last day, tier rows and a confirmation step; ops Settings shows account and security only

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
