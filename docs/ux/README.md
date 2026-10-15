# The portal's design system: how to extend it

Brief §12.5. Read this before adding a screen. Most needs are already met by a component listed below; use it rather
than building a second one. The source of truth for the look is [`DESIGN.md`](../../DESIGN.md). The brief is
[`BRIEF.md`](BRIEF.md) and the PDF at the repo root. Judgement calls are in [`DECISIONS.md`](DECISIONS.md).

## 1. How the token system works

There are three layers, all in `app/globals.css`.

| Layer                                                  | Where                                                                                                          | Example                                                                                    | Use it?                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **Brand scale**: fixed values                          | `:root`, "Brand scale"                                                                                         | `--brand-navy`, `--brand-gold`, `--brand-cream-100`                                        | Never in a component. Roles point at these. |
| **Roles**: what a colour is _for_, redefined per theme | `:root` (light), `@media (prefers-color-scheme: dark)` (system dark), `:root[data-theme="dark"]` (chosen dark) | `--bg-surface`, `--text-secondary`, `--status-attention-fg`, `--focus-ring`                | Through the Tailwind names in the next row. |
| **Tailwind names**: roles exposed as utilities         | `@theme inline`                                                                                                | `bg-surface`, `text-text-secondary`, `text-attention-fg`, `border-subtle`, `outline-focus` | **Yes, always.**                            |

Rules:

- **No raw colours** in `app/` or `components/`: no hex, `rgb()`, Tailwind palette names (`text-gray-600`) or
  arbitrary colour values. ESLint fails the build on them (`eslint.config.mjs`, "no raw colours"). Two files are
  exempt, with reasons in DECISIONS #15 and #71.
- **Need a colour that has no role?** Add the role in all three blocks: light, system dark and chosen dark (copy the
  dark values into both dark blocks). Expose it in `@theme inline` as `--color-<name>`, then run
  `node scripts/design-tokens-contrast.mjs`. It rewrites [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) with measured
  contrast and lists any pair under 4.5:1 for text or 3:1 for UI.
- **Ops is navy in both themes** (the Navy Side Rule, DECISIONS #1). On navy, use the fixed `on-navy-*` roles: text,
  muted, status dots and the white veils `on-navy-hover / -selected / -line`.
- **Type:** `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body` and `text-body-sm`. Serif
  (Newsreader) for display, h1 and h2; DM Sans for everything else; Geist Mono for references.
- **Shape:** `rounded-control` (6 px), `rounded-card` (10 px) and `rounded-pill`. **Motion:** 150–200 ms ease-out,
  and nothing moves under `prefers-reduced-motion`.
- **Print** has its own role overrides at the bottom of `globals.css` (`@media print`): white paper, no chrome. Add
  `print:hidden` to anything with no meaning on paper. Give a DataTable column `printHidden` to drop it.
- Some older names (`text-strong`, `bg-card`, `border-border`, `text-muted-foreground`) still resolve through the
  "Legacy role aliases" block, and a few screens use them. Prefer the role names in new code. When you touch a file
  that uses an alias, switch it over.

## 2. How to add a booking status

A status is a database value, so it starts in a migration. TypeScript then lists every screen that has to learn about
it.

1. **Database:** add a migration with `alter type booking_status add value 'NEW_STATUS' after '…';`. The enum is
   created in `supabase/migrations/20261006000000_initial_schema.sql`.
2. **State machine:** add it to `BOOKING_STATUSES` and its legal moves to `TRANSITIONS` in
   `lib/domain/booking-state-machine.ts`. Decide whether it `isTerminal` and whether it `consumesInventory`.
3. **Words and colour** in `lib/domain/status.ts`: a label in `STATUS_LABELS` (sentence case, from brief §2.3) and a
   tone in `statusTone`. Use one of `neutral | info | attention | success | success-soft | muted | danger`. Outcomes
   such as declined or expired are `muted`; `danger` is only for something broken. If the decision clock runs in this
   status, add it to `SLA_RUNNING`. Set `nounFor` if it is a booking rather than a request.
4. **What happens next:** `nextStep` in `lib/domain/next-step.ts` (the sentence under the header) and
   `requestProgress` in `lib/domain/progress.ts` (the five-step tracker).
5. **Actions:** the panel for each role in `components/requests/request-actions.tsx`, plus any API route that moves a
   request into or out of the status.
6. **Lists and filters:** the partner Requests buckets (`lib/requests/partner-list.ts`) and the ops Bookings filters.
7. Run `npx tsc --noEmit`. Every `switch` and `Record<BookingStatus, …>` that is missing the new value fails. Then
   `npm test`: `status.test.ts`, `booking-state-machine.test.ts` and `next-step.test.ts` cover the rules.
8. Check `/dev/system` (Status language), which renders every status pill.

Never render a status yourself. Always use `<StatusPill status={…} />`, so every pill in both apps reads the same.

## 3. How to add a table

Use `DataTable` (`components/ui/data-table.tsx`). It is a real `<table>` from 768 px up and a list of cards below,
from the same column definitions. It handles the sticky header, sort links, row links, hover and focus actions, and
the empty state.

```tsx
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status-pill";

const columns: DataTableColumn<Row>[] = [
  { key: "ref", header: "Reference", primary: true, cell: (r) => r.reference }, // identity: the row link, first on a card
  { key: "stay", header: "Stay", sortable: true, cell: (r) => stayWords(r) },
  { key: "total", header: "Total", numeric: true, cell: (r) => formatMoney(r.totalCents, "AUD") }, // right-aligned, tabular
  { key: "notes", header: "Notes", optional: true, cell: (r) => r.notes }, // hidden below 1024 px (cards keep it)
  { key: "status", header: "Status", status: true, cell: (r) => <StatusPill status={r.status} /> }, // last; top-right on a card
];

<DataTable
  columns={columns}
  rows={rows}
  rowKey={(r) => r.id}
  rowHref={(r) => `/requests/${r.id}`}
  rowLabel={(r) => `Open request ${r.reference}`}
  caption="Requests, ordered by decision deadline" // read by screen readers; also say the order in the subtitle
  sort={{ key, dir }}
  sortHref={(key, dir) => `?sort=${key}&dir=${dir}`} // sorting lives in the URL, so it survives a refresh
  empty={<EmptyState icon={Inbox} title="You're all caught up" body="…" />}
/>;
```

Also:

- Wrap it in `border-subtle bg-surface rounded-card overflow-clip border` like the other lists.
- Pass `dense` on ops screens (48 px rows).
- For pagination, use `components/ui/list-pagination.tsx`.
- For list URL state, use `lib/domain/list-params.ts`.
- For export, follow `/api/requests/export`. `csvCell` (`lib/domain/list-display.ts`) makes cells safe from spreadsheet formulas.

A list needs four designed states besides the rows: loading (the route's `loading.tsx` skeleton), empty
(`EmptyState`), error (`ErrorState` with a reference) and stale (`SyncState` when the data comes from Hostaway).

## 4. Where every pattern lives

| Need                                                       | Use                                                                                             | File                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Button (primary gold, secondary, tertiary, destructive)    | `Button`, `buttonVariants`                                                                      | `components/ui/button.tsx`                                 |
| One gold button per view                                   | rule, not a component                                                                           | brief §4.4; give the second action `secondary`             |
| Submit that shows it is working and ignores a double press | `SubmitButton`                                                                                  | `components/ui/submit-button.tsx`                          |
| "Are you sure?"                                            | `ConfirmButton`, `ConfirmDialog`                                                                | `components/ui/confirm-button.tsx`, `dialog.tsx`           |
| Side panel form (New partner, Invite, Publish version)     | `Sheet`, `SheetForm`                                                                            | `components/ui/dialog.tsx`                                 |
| Text field, select, label, error line                      | `fieldClasses`, `labelClass`, `fieldErrorClass`                                                 | `components/ui/field.ts`                                   |
| Password with show/hide                                    | `PasswordInput` (owns its label)                                                                | `components/auth/password-input.tsx`                       |
| Single date or stay range                                  | `DateField`, `DateRangeField`                                                                   | `components/ui/date-field.tsx`                             |
| Status of a request or booking                             | `StatusPill`                                                                                    | `components/ui/status-pill.tsx` + `lib/domain/status.ts`   |
| Decision clock                                             | `SlaBadge`                                                                                      | `components/ui/sla-badge.tsx`                              |
| Neutral chip                                               | `Pill`                                                                                          | `components/ui/pill.tsx`                                   |
| Five-step progress                                         | `StepTracker` + `requestProgress`                                                               | `components/ui/step-tracker.tsx`, `lib/domain/progress.ts` |
| Table or card list                                         | `DataTable`                                                                                     | `components/ui/data-table.tsx`                             |
| Nothing to show / failed to load / data freshness          | `EmptyState`, `ErrorState`, `SyncState`                                                         | `components/ui/states.tsx`                                 |
| Inline message strip                                       | `Banner` (info, warn, error, success)                                                           | `components/ui/banner.tsx`                                 |
| Confirmation after an action                               | `Toast`, or `Flash` with `toast` from `?done=`                                                  | `components/ui/toast.tsx`, `components/requests/flash.tsx` |
| Error from an API code, in the reader's words              | `Flash error={code} audience="partner" \| "ops"`                                                | `components/requests/flash.tsx`                            |
| One-line definition ("What is a hold?")                    | `HelpTip`                                                                                       | `components/ui/help-tip.tsx`                               |
| Copy a reference                                           | `CopyButton`                                                                                    | `components/ui/copy-button.tsx`                            |
| Print this page                                            | `PrintButton` + `print:hidden`                                                                  | `components/ui/print-button.tsx`, `globals.css`            |
| Headers, navigation, account menu, theme switch            | `AppShell`                                                                                      | `components/layout/`                                       |
| Sign-in frame and the gold monogram (DECISIONS #81–82)     | `AuthShell`, `BrandMark`, `MarkTilt` (outlines from `scripts/brand/trace-mark.py`)              | `components/auth/auth-shell.tsx`, `brand-mark.tsx`         |
| Money, dates, times                                        | `formatMoney` (AUD, integer cents); `formatDate` and `formatTimestamp` (always with a timezone) | `lib/domain/money.ts`, `lib/utils.ts`                      |
| Property names on partner screens                          | `displayPropertyName` (no unit numbers before approval)                                         | `lib/domain/property-name.ts`                              |
| Listing photos                                             | `next/image` when `canOptimiseImage(url)`                                                       | `lib/listings/images.ts`, `next.config.ts`                 |

**See everything rendered:** `/dev/system` shows every component, status, state and §9.2 error code. `/dev/kit` is the
older gallery that the a11y and visual tests use. Both are dev-only and 404 in production.

## 5. Before you merge a UI change

- `npx tsc --noEmit`, `npx eslint .` (fails on raw colours) and `npm test`.
- `npx playwright test --project desktop-chromium --project mobile-390`, plus `tests/e2e/routes-a11y.spec.ts` with the
  test accounts in the environment. Use `--workers=2` against the dev server. The target is zero critical or
  serious axe findings in both themes.
- Look at the screen at 390, 1024 and 1440 px in light and dark. `node scripts/ux-screenshots.mjs after` captures
  all of them (see `after/INDEX.md` for the variables).
- If you made a judgement call, add a row to `DECISIONS.md`. If the screen wants data the API does not give, add it
  to `NEEDS_BACKEND.md` and build against what exists.
