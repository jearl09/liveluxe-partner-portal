# UX Phase 3–4: verification, fixes found, and the handover guide

**Branch** `ux/08-verification-and-handover` → **base** `ux/07-auth`

## What changes, in plain words

We checked the whole portal against the brief's definition of done (VERIFICATION.md) and fixed what we found. The biggest: search could show 'Price on application' for long stays because a database read was cut off at 1,000 rows. Also: the account menu trapped keyboard users, the calendar took 90 Tab presses, some error messages were written for staff rather than partners, printing wasted a page, and the Search page now loads fast enough for the brief (Lighthouse 94–98). Ends with docs/ux/README.md, which tells the next developer how to extend the design system.

## Checklist items this closes (brief §12.4 / §13)

- [x] Every §12.4 item; see VERIFICATION.md (22 pass, 2 partial with backend gaps logged)
- [x] axe: zero critical/serious on every route in both themes
- [x] Keyboard-only pass of queue and request flow
- [x] Lighthouse ≥ 90 on /search with dates
- [x] Zero raw colours; one gold primary per view
- [x] Every §9.2 error code rendered in /dev/system

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### dashboard

| Before | After |
| --- | --- |
| ![before dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/dashboard/light-1440.png?raw=true) | ![after dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/dashboard/light-1440.png?raw=true) |
| ![before dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/dashboard/dark-390.png?raw=true) | ![after dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/dashboard/dark-390.png?raw=true) |

### search-dates

| Before | After |
| --- | --- |
| ![before search-dates light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/search-dates/light-1440.png?raw=true) | ![after search-dates light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/search-dates/light-1440.png?raw=true) |
| ![before search-dates dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/search-dates/dark-390.png?raw=true) | ![after search-dates dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/search-dates/dark-390.png?raw=true) |

### invoices

| Before | After |
| --- | --- |
| ![before invoices light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/invoices/light-1440.png?raw=true) | ![after invoices light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/invoices/light-1440.png?raw=true) |
| ![before invoices dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/invoices/dark-390.png?raw=true) | ![after invoices dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/invoices/dark-390.png?raw=true) |

### request-pay

| Before | After |
| --- | --- |
| ![before request-pay light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/request-pay/light-1440.png?raw=true) | ![after request-pay light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/request-pay/light-1440.png?raw=true) |
| ![before request-pay dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/before/request-pay/dark-390.png?raw=true) | ![after request-pay dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/08-verification-and-handover/docs/ux/after/request-pay/dark-390.png?raw=true) |


## How to check it

- `npx playwright test --project desktop-chromium --project mobile-390`
- `tests/e2e/routes-a11y.spec.ts` with the test accounts in the environment (see VERIFICATION.md)
- Search 60 nights in Docklands: every property shows a price.

## Commits (7)

- 958b0ff Header: short availability wording so it no longer overlaps the nav; full sentence in the tooltip
- ca68ee1 UX Phase 3 · Search: nightly prices read in batches under Supabase's 1,000-row cap (long stays and price sort no longer fall to 'Price on application'); one cover photo per listing instead of every photo row; cards use next/image for Hostaway's listing bucket with the first row eager and high priority (Lighthouse desktop 83-85 to 94-98)
- 410052a UX Phase 3 · Accessibility: axe on every signed-in route in both themes (tests/e2e/routes-a11y.spec.ts, accounts from env); password field named 'Password' (label by htmlFor, not wrapping the toggle); no aria-required on date-picker buttons; account menu closes on Tab instead of trapping focus; 90-day calendar is one tab stop with arrows, Home and End; E2E updated for the 'Sign in' heading and WebKit
- fa94619 UX Phase 3 · Brief rules: no raw colours left (on-navy veil and qr-surface tokens); one gold primary per view (Dashboard: first action item or Search; request detail: sticky bar only below 1024 px); ops nav lists Partners and Rate cards only for roles that can open them; print: the request record fits two A4 pages, the invoice summary one, with a header line, names in full and no action column
- 81b9e2d UX Phase 3 · Error states (brief §9.2): partners see plain wording and never an ops instruction (Flash audience); price panel says 'sleeps 4; you've entered 6 guests' with 'Find properties that sleep 6' and 'needs at least 7 nights' with 'Extend to 7 nights'; a suspended organisation sees a banner on every partner page; /dev/system renders all ten codes
- e36c44b UX Phase 3 · Verification record: docs/ux/VERIFICATION.md against the §12.4 checklist, DECISIONS 69-80, NEEDS_BACKEND 9-10, after/ screenshots re-captured (card-hold page now shows a request awaiting a hold)
- (this commit) UX Phase 4 · Handover: docs/ux/README.md (token layers, adding a status, adding a table, where every pattern lives, pre-merge checks) and one PR description per stacked branch in docs/ux/prs/

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
