# UX Phase 2 · Request detail (both sides)

**Branch** `ux/03-request-detail` → **base** `ux/02-shells`

## What changes, in plain words

One page for a request or booking, used by partners and by Live Luxe staff. It opens with one sentence saying what happens next and when, a five-step tracker (Submitted → Live Luxe reviewing → Approved → Confirmed → Check-in details sent), then the price, payment, check-in details and a full timeline of who did what and when. Actions sit in one panel and open in side panels with a confirmation, never inline. It prints as a clean A4 record for claim files.

## Checklist items this closes (brief §12.4 / §13)

- [x] Request detail renders the full timeline with actor and labelled time; action panel per §8.3
- [x] Every reference is copyable
- [x] Print stylesheet for the request record
- [x] SLA badge only on SUBMITTED / UNDER_REVIEW; DECLINED / EXPIRED / CANCELLED muted

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### request-approved

| Before | After |
| --- | --- |
| ![before request-approved light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-approved/light-1440.png?raw=true) | ![after request-approved light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-approved/light-1440.png?raw=true) |
| ![before request-approved dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-approved/dark-390.png?raw=true) | ![after request-approved dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-approved/dark-390.png?raw=true) |

### request-declined

| Before | After |
| --- | --- |
| ![before request-declined light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-declined/light-1440.png?raw=true) | ![after request-declined light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-declined/light-1440.png?raw=true) |
| ![before request-declined dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-declined/dark-390.png?raw=true) | ![after request-declined dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-declined/dark-390.png?raw=true) |

### request-cancelled

| Before | After |
| --- | --- |
| ![before request-cancelled light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-cancelled/light-1440.png?raw=true) | ![after request-cancelled light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-cancelled/light-1440.png?raw=true) |
| ![before request-cancelled dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/request-cancelled/dark-390.png?raw=true) | ![after request-cancelled dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-cancelled/dark-390.png?raw=true) |

### request-submitted

| Before | After |
| --- | --- |
| _new state, no before_ | ![after request-submitted light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-submitted/light-1440.png?raw=true) |
| _new state, no before_ | ![after request-submitted dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-submitted/dark-390.png?raw=true) |

### request-confirmed

| Before | After |
| --- | --- |
| _new state, no before_ | ![after request-confirmed light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-confirmed/light-1440.png?raw=true) |
| _new state, no before_ | ![after request-confirmed dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/request-confirmed/dark-390.png?raw=true) |

### admin-booking-approved

| Before | After |
| --- | --- |
| ![before admin-booking-approved light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/admin-booking-approved/light-1440.png?raw=true) | ![after admin-booking-approved light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/admin-booking-approved/light-1440.png?raw=true) |
| ![before admin-booking-approved dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/before/admin-booking-approved/dark-390.png?raw=true) | ![after admin-booking-approved dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/admin-booking-approved/dark-390.png?raw=true) |

### admin-booking-submitted

| Before | After |
| --- | --- |
| _new state, no before_ | ![after admin-booking-submitted light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/admin-booking-submitted/light-1440.png?raw=true) |
| _new state, no before_ | ![after admin-booking-submitted dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/03-request-detail/docs/ux/after/admin-booking-submitted/dark-390.png?raw=true) |


## How to check it

- Open a submitted, an approved and a declined request as partner and as ops.
- Print one (Ctrl+P).

## Commits (1)

- ce5f94c UX Phase 2 · request detail: one screen for both sides with next-step sentence, step tracker, action panel (Sheets and ConfirmDialogs listing consequences), copyable references, one banner, tiered check-in details, timeline with what is still to come; usability tasks a, b, d, e run and USABILITY.md started

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
