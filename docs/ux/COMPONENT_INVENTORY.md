# Component inventory — before the redesign (Phase 0, 14 Oct 2026)

Where buttons, pills, tables, forms and dates are rendered today, how many variants exist, every raw colour and
every one-off. Counts are from `grep` over `app/` and `components/` on commit `c141637`; "files / uses" means
distinct files and total occurrences.

## 1. Buttons

| Component              | Where                                                                                  | Uses    | Variants in use                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `Button` (cva)         | `components/ui/button.tsx`                                                             | 17 / 42 | default (navy), gold, destructive, outline, secondary, ghost, link; sizes default 44, sm 36, lg 48, icon |
| `SubmitButton`         | `components/ui/submit-button.tsx`                                                      | 20 / 27 | wraps Button with a pending label                                                                        |
| `ConfirmButton`        | `components/ui/confirm-button.tsx`                                                     | 6 / 7   | two-press confirm; defaults to ghost/sm                                                                  |
| hand-rolled `<button>` | `app-shell.tsx` (Sign out), `theme-toggle.tsx`, `print-button.tsx`, `payment-form.tsx` | 4 files | own classes, 36 px tall                                                                                  |

Variant counts across the apps: outline 25, gold 14, ghost 3, destructive 3, secondary 1, link 1, default (navy) by
omission on every `<Button>` / `<SubmitButton>` without a `variant` (≈ 20, including Sign in, Get price, Search,
Filter). **Two "primary" looks coexist (brief C1):** gold on Create partner, Publish, Send invitation, Submit
request, Accept the proposal; navy on Sign in, Get price, Search, Filter, Save settings. Brief §4.4 collapses this
to four kinds with gold as the only primary.

One-offs: the search form's Search button; the Stripe Payment Element button styled through Stripe `appearance`
with raw hex (`payment-form.tsx:114`); the dashboard's two competing CTAs ("New request on behalf of…" gold,
"Find a property" outline).

## 2. Pills, badges and status

| Component                        | Where                                                                | Uses  | Notes                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatusPill`                     | `components/ui/status-pill.tsx`                                      | 5 / 7 | the one booking-status mapping; 6 tones for 13 statuses (navy-outline, gold, gold-filled, green, muted, red)                                                                                                                            |
| `Pill`                           | `components/ui/pill.tsx`                                             | 8 / 9 | ok / warn / bad / muted / neutral; SLA band, standing, person status                                                                                                                                                                    |
| hand-rolled `rounded-full` spans | 14 files outside `components/ui`                                     | 21    | admin bookings + queue (SLA badge, counts), rate-card version chips, invoices status chips, listing availability legend, dashboard freshness pill, attention strip, agenda, KPI icon discs, timeline dots, both `loading.tsx` skeletons |
| SLA badge                        | inline in `app/(admin)/admin/bookings/page.tsx` and `queue/page.tsx` | 2     | rendered on every row regardless of status (brief C4)                                                                                                                                                                                   |
| Invoice status chip              | inline `STATUS` map in `app/(portal)/invoices/page.tsx`              | 1     | own colours (`border-gold-500 text-gold-600`, emerald/red Tailwind)                                                                                                                                                                     |

Thirteen statuses exist in the enum; `STATUS_LABELS` covers all thirteen; the pill tones collapse Declined,
Cancelled and Failed into the same red (brief §2.3 wants muted for the first two). No `SlaBadge`, `SyncState` or
`FreshnessChip` component exists; sync state is rendered twice on the dashboard (`freshness-pill.tsx` and a
`Banner`), see brief C10.

## 3. Tables and lists

| Where                             | Implementation                                           | Sortable | Row link  | Mobile                      |
| --------------------------------- | -------------------------------------------------------- | -------- | --------- | --------------------------- |
| `/requests`                       | `components/requests/requests-table.tsx` (raw `<table>`) | no       | yes (ref) | card list under 1280 px     |
| `/` dashboard requests            | `components/dashboard/requests-table.tsx`                | no       | yes       | card list                   |
| `/admin/queue`, `/admin/bookings` | inline `<table>` in page                                 | no       | yes       | horizontal scroll (`Table`) |
| `/admin/partners`                 | inline `<table>`                                         | no       | **no**    | horizontal scroll           |
| `/admin/rate-cards`               | inline `<table>`                                         | no       | yes       | horizontal scroll           |
| `/invoices`                       | inline `<table>`                                         | no       | partial   | horizontal scroll           |
| `/team`                           | `Panel` + list                                           | n/a      | n/a       | stacks                      |

`components/ui/table.tsx` provides `Table`, `theadClass`, `thClass`, `tdClass` (3 files use it). No `DataTable`
with a card mode, no sticky header, no sort indicator, no page-size control, no bulk selection, no row hover on
most tables (brief C8). `ListPagination` exists (`components/ui/list-pagination.tsx`) and is used on requests and
bookings.

## 4. Forms and inputs

- 31 `<form>` elements in 24 files; all are plain HTML posts to route handlers (no client state, no autosave).
- Field styling is global (`app/globals.css` base layer) plus `components/ui/field.ts` (`fieldClass`,
  `labelClass`, `invalidFieldClass`, `fieldErrorClass`). Labels wrap controls; 12 px labels; 44 px fields.
- Native controls: `<select>` 8 uses in 6 files (partner form, decline reason, cancellation reason, invite role,
  search bedrooms, counter-offer); `<textarea>` 9 uses; **`<input type="date">` 12 uses in 6 files** (search,
  listing price panel, request form, counter-offer, modification panel, rate-card validity) — brief §4.5 forbids
  native date inputs.
- Permanently inline create forms (brief C6): New partner (`/admin/partners`), Publish a new version
  (`/admin/rate-cards/[orgId]`), Invite someone (`/team`), Invite user (`/admin/partners/[id]`).
- Conditional fields always visible (brief C7): credit limit, deposit %, finance contact in the partner form.
- Repeating data as delimited text: rate-card length-of-stay tiers (`nights:percent` per line).
- Required fields: no visual marker, no `aria-required`.
- Money inputs: plain text fields with "(AUD)" in the label; no prefix, not right-aligned.
- No Sheet, Dialog, Popover, Combobox, Calendar, Tabs, Toast, Tooltip or Skeleton components from shadcn/ui are
  installed; `Skeleton` appears as two hand-written loading pages.

## 5. Dates, times and money

- Helpers: `formatDate` (27 uses, `12 Nov 2026`), `formatTimestamp` (21 uses, `13 Oct 2026, 5:24 pm AEDT`),
  `formatDayMonth` (3), `humanizeDuration` (SLA / hold countdowns), `formatMoney` (`AUD $1,837.00`).
- Inconsistent relative phrasing exists alongside: "Availability synced just now", "Updated 2 min ago",
  "just now" (dashboard, freshness pill) — brief C11.
- Stay ranges render as `12 Nov 2026 → 17 Nov 2026 · 5 nights` in `StayCard`; tables vary (some omit nights, some
  use day-month only).
- Numbers: `tabular-nums` applied globally to `table`, `dl`, `time` in `globals.css`; KPI tiles rely on it.

## 6. Surfaces and layout primitives

| Component                                                | Uses        | Notes                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel` / `PanelHeading` / `PanelSection` / `GroupLabel` | 21 / 75     | the one bordered surface; 14 px radius, 20 px padding                                                                                                                                                                               |
| `PageHeader`                                             | 14 / 14     | eyebrow + serif h1 + description + actions                                                                                                                                                                                          |
| `Banner`                                                 | 7 / 21      | info / warn / error / success; multiple per page on request detail (up to 4 stacked)                                                                                                                                                |
| `StatCard`                                               | 0           | superseded by `components/dashboard/kpi-row.tsx` (own markup)                                                                                                                                                                       |
| `AppShell`, `NavLinks`, `Wordmark`, `ThemeToggle`        | shells      | header shows org/email/role text block (brief C12); nav underline uses `after:` pseudo; focus ring persists after click (brief C2: `focus-visible:ring-2` is used on nav, but the sign-out and theme buttons use bare focus styles) |
| `ErrorView`, `Trouble`                                   | error pages | support reference shown                                                                                                                                                                                                             |

## 7. Raw colours and one-offs (what the Phase 1 lint rule must catch)

Raw hex outside `globals.css`: **8 occurrences in 2 files**

- `app/global-error.tsx` (6): inline styles for the last-resort error page (`#faf7f1`, `#2b3442`, `#0b1422`,
  `#c9d1dd`, `#f3f5f8`, `#b7853a`, `#101c2c`, `#fff`). Justifiable (no CSS loaded) but must move to the new values.
- `components/payments/payment-form.tsx` (2): Stripe `appearance.variables` (`#b7853a`, `#101c2c`, radius 6px).

Tailwind palette colours (not tokens): **11 distinct classes, 27 uses** — `bg-red-50` 4, `border-red-200` 4,
`text-red-900` 3, `text-red-800` 1, `bg-amber-50` 3, `border-amber-200` 3, `text-amber-900` 3,
`bg-emerald-50` 2, `border-emerald-200` 2, `text-emerald-900` 1, `text-emerald-800` 1. They live in
`cancel-panel.tsx`, `checkin-panel.tsx`, `decision-panel.tsx`, `payment-panel.tsx`, `modification-panel.tsx`,
`invoices/page.tsx` and the admin booking page banners, duplicating the `ok/warn/bad` tokens.

Brand-scale classes used directly instead of roles (`navy-900`, `gold-500`, `gold-600`, `cream-300`,
`ink-500`): admin header, wordmark, invoices status map, listing page, dev kit. These are tokens, but they bypass
the theme (the invoices chip is why the light theme breaks there, brief C3).

Arbitrary Tailwind colour values (`[#…]`): none.

## 8. Copy that must not ship (brief §11.3)

- `app/(admin)/admin/settings/page.tsx:23` "Business tunables (…) are edited here from Phase 3."
- `app/(portal)/settings/page.tsx:23` "Organisation defaults and notification preferences arrive in Phase 2."
- `app/(portal)/page.tsx:107` eyebrow "Fallback" on the manual-search card.
- `app/(portal)/page.tsx` "New request on behalf of…" CTA on the partner side.
- `app/(admin)/admin/rate-cards/[orgId]/page.tsx` "Ends (optional, exclusive)", tiers as `nights:percent`.
- Search cards "from AUD $… / night" with no dates; listing titles with channel prefixes ("Live Luxe | …").
- `/team` "Last seen: Never" for the signed-in user.

## 9. Totals

| Thing                                           | Count                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Button looks (component variants + hand-rolled) | 7 + 4                                                                           |
| Primary-action looks                            | 2 (gold, navy) → brief wants 1                                                  |
| Pill implementations                            | 2 components + 21 hand-rolled spans in 14 files                                 |
| Table implementations                           | 7 (2 components, 5 inline) → brief wants 1 `DataTable`                          |
| Native date inputs                              | 12 in 6 files → brief wants 0                                                   |
| Permanently inline create forms                 | 4 → brief wants 0                                                               |
| Raw hex outside the token file                  | 8 in 2 files → brief wants 0                                                    |
| Tailwind palette colour classes                 | 27 uses → brief wants 0                                                         |
| shadcn/ui primitives installed                  | 0 of Dialog, Sheet, Popover, Combobox, Calendar, Tabs, Toast, Skeleton, Tooltip |
