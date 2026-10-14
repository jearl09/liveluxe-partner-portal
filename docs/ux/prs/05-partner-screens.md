# UX Phase 2 · Partner screens: Dashboard, Search, Property, New request, Requests, Invoices, Team, Settings

**Branch** `ux/05-partner-screens` → **base** `ux/04-ops-queue-bookings`

## What changes, in plain words

Everything a partner uses day to day. The Dashboard shows what needs their action and a search box straight away. Search shows prices only once dates are chosen, with the nightly average and the stay total. The property page has a photo viewer, grouped amenities, a 90-day calendar you can click to pick dates, and the full price. Sending a request is two short steps, then a card hold for card-paying partners; the form saves a draft and never clears on an error. Requests and Invoices get filter chips, search, and a CSV download; Team invites open in a side panel and warn when an email is outside the organisation's domain.

## Checklist items this closes (brief §12.4 / §13)

- [x] Dashboard: Needs-your-action strip and search above the fold
- [x] Search: no price without dates; nightly average and stay total
- [x] Property calendar sets dates on click; amenities grouped with show-all; house rules collapsed
- [x] No permanently inline forms (Invite, New request)
- [x] Usability tasks (a) place a family of 4, (b) find when check-in details arrive
- [x] Every amount shows AUD

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### dashboard

| Before | After |
| --- | --- |
| ![before dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/dashboard/light-1440.png?raw=true) | ![after dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/dashboard/light-1440.png?raw=true) |
| ![before dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/dashboard/dark-390.png?raw=true) | ![after dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/dashboard/dark-390.png?raw=true) |

### search

| Before | After |
| --- | --- |
| ![before search light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/search/light-1440.png?raw=true) | ![after search light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/search/light-1440.png?raw=true) |
| ![before search dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/search/dark-390.png?raw=true) | ![after search dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/search/dark-390.png?raw=true) |

### search-dates

| Before | After |
| --- | --- |
| ![before search-dates light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/search-dates/light-1440.png?raw=true) | ![after search-dates light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/search-dates/light-1440.png?raw=true) |
| ![before search-dates dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/search-dates/dark-390.png?raw=true) | ![after search-dates dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/search-dates/dark-390.png?raw=true) |

### listing

| Before | After |
| --- | --- |
| ![before listing light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/listing/light-1440.png?raw=true) | ![after listing light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/listing/light-1440.png?raw=true) |
| ![before listing dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/listing/dark-390.png?raw=true) | ![after listing dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/listing/dark-390.png?raw=true) |

### listing-priced

| Before | After |
| --- | --- |
| ![before listing-priced light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/listing-priced/light-1440.png?raw=true) | ![after listing-priced light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/listing-priced/light-1440.png?raw=true) |
| ![before listing-priced dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/listing-priced/dark-390.png?raw=true) | ![after listing-priced dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/listing-priced/dark-390.png?raw=true) |

### request-new

| Before | After |
| --- | --- |
| ![before request-new light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/request-new/light-1440.png?raw=true) | ![after request-new light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/request-new/light-1440.png?raw=true) |
| ![before request-new dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/request-new/dark-390.png?raw=true) | ![after request-new dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/request-new/dark-390.png?raw=true) |

### requests

| Before | After |
| --- | --- |
| ![before requests light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/requests/light-1440.png?raw=true) | ![after requests light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/requests/light-1440.png?raw=true) |
| ![before requests dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/requests/dark-390.png?raw=true) | ![after requests dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/requests/dark-390.png?raw=true) |

### invoices

| Before | After |
| --- | --- |
| ![before invoices light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/invoices/light-1440.png?raw=true) | ![after invoices light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/invoices/light-1440.png?raw=true) |
| ![before invoices dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/invoices/dark-390.png?raw=true) | ![after invoices dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/invoices/dark-390.png?raw=true) |

### team

| Before | After |
| --- | --- |
| ![before team light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/team/light-1440.png?raw=true) | ![after team light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/team/light-1440.png?raw=true) |
| ![before team dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/team/dark-390.png?raw=true) | ![after team dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/team/dark-390.png?raw=true) |

### settings

| Before | After |
| --- | --- |
| ![before settings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/settings/light-1440.png?raw=true) | ![after settings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/settings/light-1440.png?raw=true) |
| ![before settings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/before/settings/dark-390.png?raw=true) | ![after settings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/05-partner-screens/docs/ux/after/settings/dark-390.png?raw=true) |


## How to check it

- As the demo partner: task (a) from USABILITY.md end to end at 390 px and 1440 px.

## Commits (7)

- 94ea5e6 UX Phase 2 · partner Dashboard: greeting, one-line Needs-your-action list (now with card holds), shared search bar with range date picker and one SyncState line, In progress KPI with waiting count and working links, requests table on DataTable limited to live and next-14-day stays with shared next-step words, eight activity items in sentence case; street-style property names on partner surfaces
- 6797a7f UX Phase 2 · Search: shared bar with range picker (sticky from 1024 px, three-up household row on phones), one SyncState line, results header in words, sort (best, price both ways, bedrooms), cards with pricing only when dated and no 'from' price, Price on application group, near-miss dates with counts, search every suburb and the manual request when nothing is free
- 4e24639 UX Phase 2 · Property detail: lightbox gallery, eyebrow and at-a-glance chips with parking/lift/access, one SyncState line, price panel with range picker, how-you-pay sentence, 'Request this property' and a next step when dates fail, 90-day calendar that picks a stay, stay details, three-step check-in and access from settings, clamped description, curated grouped amenities, collapsed house rules; sync lookup moved to a server helper
- 1453435 UX Phase 2 · New request flow: two steps on one page (guest and references, review and send) with a step indicator, optional fields marked, summary before sending, how-you-pay sentence, tick kept on bounce, local draft autosave; card-paying partners land on the card hold as step 3; stale dates explain themselves and offer other dates, other properties or a manual search; card-hold page on tokens; usability tasks a and b pass
- 6290a90 UX Phase 2 · partner Requests: five chips with counts (All, Needs my action incl. missing card holds, In progress, Confirmed, Closed), action banner, search by reference/claim/PO/guest, sortable DataTable with masked guest and shared next-step words, CSV of the current view (formula-safe); Dashboard tiles link to the chips; old ?tab= links still land
- e320a0f UX Phase 2 · Invoices: Outstanding, Overdue (danger when any) and Paid this month; filters To pay, Overdue, Paid; Stripe number, booking link and property, issued, due with relative time, amount left to pay, plain status with Overdue derived from the due date; Pay now as the primary row action for partner roles, View and PDF otherwise; tokens in both themes
- 6ad40fd UX Phase 2 · Team and Settings: people and invitations in one DataTable with plain statuses and Now for yourself, Invite someone Sheet with role radios in brief order and an email-domain warning, remove access behind a confirmation and disabled for the only administrator; Settings shows account, security and organisation details as held, with Ask for a change; group 5 usability recorded

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
