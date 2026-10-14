# UX Phase 2 · Shells: headers, navigation, account menu

**Branch** `ux/02-shells` → **base** `ux/01-audit-and-design-system`

## What changes, in plain words

The frame around every page. Live Luxe staff get a navy header with the number of requests waiting; partners get a cream header. Both have an account menu with name, organisation and role, a light/dark/system switch, and a dot that says how fresh the availability data is. On phones, partners get a tab bar at the bottom and staff get a menu drawer.

## Checklist items this closes (brief §12.4 / §13)

- [x] Light theme correct on every screen (shell)
- [x] Nothing important hidden behind hover (§13 rule 8)

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### dashboard

| Before | After |
| --- | --- |
| ![before dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/before/dashboard/light-1440.png?raw=true) | ![after dashboard light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/after/dashboard/light-1440.png?raw=true) |
| ![before dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/before/dashboard/dark-390.png?raw=true) | ![after dashboard dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/after/dashboard/dark-390.png?raw=true) |

### admin-queue

| Before | After |
| --- | --- |
| ![before admin-queue light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/before/admin-queue/light-1440.png?raw=true) | ![after admin-queue light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/after/admin-queue/light-1440.png?raw=true) |
| ![before admin-queue dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/before/admin-queue/dark-390.png?raw=true) | ![after admin-queue dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/02-shells/docs/ux/after/admin-queue/dark-390.png?raw=true) |


## How to check it

- Sign in as a partner and as ops; switch themes; try 390 px.

## Commits (1)

- 2b48fb8 UX Phase 2 · shells: navy ops header and cream partner header with account menus, sync dot, Queue count; partner bottom tab bar and ops drawer on phones; Contact Live Luxe in the footer; Invoices hidden from viewers and Team from non-admins in the nav

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
