# UX Phase 2 · Ops Queue and Bookings

**Branch** `ux/04-ops-queue-bookings` → **base** `ux/03-request-detail`

## What changes, in plain words

The screen Live Luxe staff work from. Requests are ordered by how soon a decision is due, with a coloured band and words for on track, at risk and overdue. Approve and Decline are on each row; counter-offer and assign are one click further. Four summary cards at the top filter the list. Also fixes a real bug: approving sometimes said 'confirmation failed' when the booking had in fact confirmed.

## Checklist items this closes (brief §12.4 / §13)

- [x] Usability tasks (d) ops approves the most urgent, (e) ops declines with a reason
- [x] Every list has loading, empty, error and stale states (Queue, Bookings)
- [x] Tables become cards below 768 px

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### admin-queue

| Before | After |
| --- | --- |
| ![before admin-queue light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/before/admin-queue/light-1440.png?raw=true) | ![after admin-queue light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/after/admin-queue/light-1440.png?raw=true) |
| ![before admin-queue dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/before/admin-queue/dark-390.png?raw=true) | ![after admin-queue dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/after/admin-queue/dark-390.png?raw=true) |

### admin-bookings

| Before | After |
| --- | --- |
| ![before admin-bookings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/before/admin-bookings/light-1440.png?raw=true) | ![after admin-bookings light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/after/admin-bookings/light-1440.png?raw=true) |
| ![before admin-bookings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/before/admin-bookings/dark-390.png?raw=true) | ![after admin-bookings dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/04-ops-queue-bookings/docs/ux/after/admin-bookings/dark-390.png?raw=true) |


## How to check it

- As ops: decline a test request with a reason; Escape closes the dialog and returns focus.

## Commits (1)

- 7847cbb UX Phase 2 · ops Queue and Bookings: queue with four summary cards that filter, SLA band per row, Approve and Decline on the row, one-row details (quote, partner history, guest), j/k/Enter/o/a/c/d and ? shortcuts, decisions return to the queue with a toast; Bookings with four status groups and counts, sortable DataTable, next-step cell, masked guest, claim/PO search; approve no longer reports a false failure when the webhook confirms first; unavailable-dates error gives a next step; usability tasks d and e pass

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
