# Audit of the current build — Phase 0 (14 Oct 2026)

Brief §3 confirmed against the code and the before-screenshots (`docs/ux/before/`), plus what the deterministic
detector, the design critique and the technical audit found on top. Each defect names the screens it appears on
and the brief section that fixes it. Commit under audit: `c141637` (+ Phase 0 docs).

Method: the §3 list was checked line by line against source and screenshots (section 1); `impeccable detect` ran
over `app/` and `components/` (section 2); `/impeccable critique` ran as isolated design-review agents per app
(section 3) and `/impeccable audit` as a code-level agent across both apps (section 4). Decisions taken while
auditing are in `DECISIONS.md`.

## 1. Brief §3 — confirmed, refuted, or amended

### 1.1 Cross-cutting defects

| #   | Verdict   | Evidence                                                                                                                                                                                                                                                                                                                             | Fixed by               |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| C1  | Confirmed | `Button` default variant is navy; `variant="gold"` on 14 call sites (Create partner, Publish, Send invitation, Submit request, Accept proposal); Sign in, Get price, Search, Filter, Save settings fall through to navy. `components/ui/button.tsx`, `components/search/search-form.tsx`, `components/requests/list-filters.tsx:65`. | §4.4                   |
| C2  | Partly    | Nav links and the theme toggle already use `focus-visible:` (`nav-links.tsx:40`, `theme-toggle.tsx:83,109`). The skip link uses `focus:` by design; the Sign out button and pagination links have no focus style of their own (browser default outline). Could not reproduce a persistent ring after mouse click on nav.             | §4.1 focus/ring, §12.4 |
| C3  | Confirmed | `app/(portal)/invoices/page.tsx:15-43` uses `bg-white`, `bg-cream-50`, `text-ink-500`, `border-cream-200`, emerald/red Tailwind classes instead of `bg-card` / role tokens, so the table stays white on the dark canvas.                                                                                                             | §4.1 bg/surface        |
| C4  | Confirmed | `components/requests/requests-table.tsx` `dueLabel()` renders "Overdue by …" whenever `decisionDueAt` is set, regardless of status; admin bookings passes every row through it. Status pills themselves are already muted for Declined/Cancelled (`lib/domain/dashboard.ts:69`), so the red is the SLA badge, not the pill.          | §4.6 SlaBadge          |
| C5  | Confirmed | `app/(admin)/admin/settings/page.tsx:23`, `app/(portal)/settings/page.tsx:23`, `app/(portal)/page.tsx:107` ("Fallback" eyebrow).                                                                                                                                                                                                     | §11.3                  |
| C6  | Confirmed | Inline forms: `/admin/partners` (New partner, `components/admin/partner-form.tsx`), `/admin/rate-cards/[orgId]` (Publish a new version, `rate-card-form.tsx`), `/team` (Invite someone), `/admin/partners/[id]` (Invite user).                                                                                                       | §4.5 Sheet, §5.2       |
| C7  | Confirmed | `partner-form.tsx:80` "Credit limit (AUD, invoice terms)", `:93` "Deposit % (deposit terms)"; both always visible. Select option truncation visible in `before/admin-partners/*-1024.png`.                                                                                                                                           | §4.5                   |
| C8  | Confirmed | Seven table implementations, none sortable, no sort indicator, no row hover on inline tables, no kebab; partners rows have no link (`admin/partners/page.tsx` links only the name text).                                                                                                                                             | §4.7 DataTable         |
| C9  | Confirmed | `components/requests/list-filters.tsx:32-67`: a `<form>` with a Filter `SubmitButton`; selects do not submit on change; no applied-filter chips; filter row renders on empty lists.                                                                                                                                                  | §4.7, §6.3             |
| C10 | Confirmed | Dashboard renders `components/dashboard/freshness-pill.tsx` and a `Banner` for the same stale condition.                                                                                                                                                                                                                             | §4.6 SyncState         |
| C11 | Confirmed | "Availability synced just now", "Updated 2 min ago" (dashboard) beside `formatTimestamp` output elsewhere; activity feed lowercase event names.                                                                                                                                                                                      | §11.1                  |
| C12 | Confirmed | `components/layout/app-shell.tsx:85-87` renders org/title, email · role in the header; wordmark descriptor "Operations" plus the page eyebrow "Operations".                                                                                                                                                                          | §6.1, §7.1             |
| C13 | Confirmed | Queue, Rate cards, Settings, Invoices, Team: one panel then empty canvas (`before/admin-queue/dark-1440.png`, `before/admin-settings/*`, `before/invoices/*`).                                                                                                                                                                       | §5.1, §6.x, §7.x       |
| C14 | Amended   | Measured, not eyeballed: dark muted `#8d97a6` on surface `#16233a` = **5.4:1**, light muted `#5a6373` on cream `#faf7f1` = **5.7:1**; both pass 4.5:1. The brief's `#6b7a99` guess is not in the code. Raised anyway to `#9aa5b6` (6.3:1) in DESIGN.md. 13–14 px body text in tables is real (`text-sm`, `text-xs`).                 | §4.1, §4.2             |

### 1.2 Operations console, screen by screen

- **Sign in**: confirmed. Sign in is navy (`default` variant); no show/hide password; eyebrow "Docklands,
  Melbourne"; left panel vertically unbalanced at 1440 (`before/login/dark-1440.png`).
- **Queue**: confirmed. Empty state only; filter row shown while empty; no summary strip; no inline expansion; no
  keyboard shortcuts (`app/(admin)/admin/queue/page.tsx`).
- **Bookings**: confirmed. SLA column first and red on every row; two references without labels; no next-step
  column; status chips without counts; "Showing 1–5 of 5" with page size links only above 25 rows; "Live Luxe Pty
  Ltd" rows carry no on-behalf-of tag.
- **Partners**: confirmed. Columns Organisation, Status, People, Rules; no payment mode, rate card, open requests,
  outstanding, last activity; inline New partner form; detail page reached only by clicking the organisation name,
  which is not styled as a link.
- **Rate cards**: confirmed. "None — Hostaway rate applies" per row with dashes; `rate-card-form.tsx` tiers as
  `nights:percent` lines, "Ends (optional, exclusive)", no preview, no confirmation; versions list without
  timeline.
- **Settings**: confirmed. Two rows and the Phase 3 note.

### 1.3 Partner portal, screen by screen

- **Dashboard**: confirmed. KPI tiles count placements/pending but not "needs your action"; quick search below
  the activity feed; two competing CTAs ("New request on behalf of…" gold, "Find a property" outline); duplicate
  sync warning; "Fallback" eyebrow; lowercase activity feed.
- **Search**: confirmed. Cards show a "from AUD $… / night" with no dates (`components/search/result-card.tsx`);
  titles are Hostaway `public_name` verbatim including "Live Luxe | …" prefixes; no sort, no applied-filter
  chips, no compare, no map; the date hint sits above the form, not in the results area.
- **Property detail**: confirmed. Get price is navy; calendars (`availability-strip.tsx`) are display-only; ~90
  amenity chips in one wall (`listings/[id]/page.tsx:178`); house rules shown uncollapsed with guest-facing copy
  (`house-rules.tsx`); no "availability confirmed X min ago"; address-withheld note is good and kept.
- **Invoices**: confirmed (C3). Invoice number is the Stripe id-style code in mono; no outstanding total, no
  filters, no pay action in the row, booking reference not linked.
- **Team**: confirmed. "Last seen: Never" on the signed-in user; no row actions; invite form inline.
- **Settings**: confirmed.

### 1.4 Screens the brief did not see (§3.4), audited here

- **Request detail (partner)**: up to four stacked banners above the content (status, flash, cancellation
  requested, confirmed) — brief §4.8 allows one; the quote lives in a sticky right panel but the action buttons are
  scattered across Payment, Changes to the stay and Cancellation panels rather than one action panel (§8.3); the
  timeline reads newest-first (brief §8.4 wants reading order); h1 is the reference only (good; no guest name in
  the tab title).
- **Request detail (ops)**: same, plus Decision panel with disclosures for Counter-offer and Decline (good shape;
  needs the consequence-listing confirm dialog, §5.6).
- **New request form**: single page; references captured in-form (good, §2.2); native date values come from the
  URL; no step 2 "review and pay"; no draft autosave.
- **Pay page**: Stripe Payment Element inside a panel; hold expiry shown; mode explained in a sentence (good).
- **Counter-offer accept/decline**: banner on request detail with old/new values and two buttons (good; no
  confirm dialog).
- **Check-in pack**: tiered and logged (good); copy buttons per item missing (§8.6).
- **Partner detail**: settings form plus people and invitations in one column; no tabs, no KPIs.
- **Invite / reset**: share the split layout; no "Step 1 of 2" progress hint; invalid-token state is a plain
  banner.

### 1.5 Found in this audit, not in the brief

| Finding                                                                                                                                                                                                                     | Where                                                                                       | Fixed by         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| `prefers-reduced-motion` sets every animation and transition to 0.01 ms, including the theme cross-fade and focus transitions; the brief asks to honour the preference, which means an intentional alternative, not a kill. | `app/globals.css:410-416`                                                                   | §4.3             |
| No `info` status tone exists; Submitted / Under review use a navy outline that doubles as "neutral".                                                                                                                        | `lib/domain/dashboard.ts:69`, `status-pill.tsx`                                             | §4.6             |
| Native `<input type="date">` in 6 files (12 uses).                                                                                                                                                                          | search, listing quote panel, new request, counter-offer, modification panel, rate-card form | §4.5             |
| Duplicated status colour maps: `Pill` tones, `StatusPill` tones, invoices `STATUS`, dashboard `BAND`, admin `BAND_TEXT`, banners' Tailwind amber/red/emerald classes.                                                       | see COMPONENT_INVENTORY §2, §7                                                              | §4.1, §4.6       |
| Money inputs are plain text with "(AUD)" in the label; no prefix, left-aligned, not tabular.                                                                                                                                | partner-form, rate-card-form, cancel/modification refund override                           | §4.5             |
| Last-resort error page carries the old brand hex values inline.                                                                                                                                                             | `app/global-error.tsx`                                                                      | §4.1             |
| Stripe Payment Element is themed with raw hex and ignores the dark theme.                                                                                                                                                   | `components/payments/payment-form.tsx:114`                                                  | §4.1             |
| Wordmark size `1.375rem` and the global field size `0.875rem` sit outside the type ramp.                                                                                                                                    | detector, `brand.tsx:22`, `globals.css:331`                                                 | §4.2             |
| The `/requests` bucket tabs use a 2 px accent bottom border on a rounded element.                                                                                                                                           | detector, `app/(portal)/requests/page.tsx:58`                                               | §4.7             |
| `invoices.download` is granted to every partner role, but §7.1 hides Invoices from `partner_viewer`.                                                                                                                        | `lib/domain/permissions.ts`                                                                 | NEEDS_BACKEND.md |

## 2. Deterministic scan (`impeccable detect --json app components`)

Exit code 2, 5 findings, 0 errors:

| Severity | Rule                     | Location                            | Note                                                         |
| -------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| warning  | border-accent-on-rounded | `app/(portal)/requests/page.tsx:58` | bucket tab underline; replace with the nav underline pattern |
| advisory | design-system-color      | `app/global-error.tsx:17`           | `#2b3442` not in DESIGN.md                                   |
| advisory | design-system-color      | `app/global-error.tsx:25`           | `#b7853a` (old gold) not in DESIGN.md                        |
| advisory | design-system-font-size  | `app/globals.css:331`               | field text 0.875rem off the ramp (ramp is 15/13 px)          |
| advisory | design-system-font-size  | `components/layout/brand.tsx:22`    | wordmark 1.375rem off the ramp                               |

The detector does not see Tailwind palette classes (`bg-red-50` etc.) or brand-scale classes used as roles; the
Phase 1 lint rule must (COMPONENT_INVENTORY §7).

## 3. Design critique (`/impeccable critique`, per route)

_Appended below from the isolated design-review agents._

## 4. Technical audit (`/impeccable audit`)

_Appended below from the code-level audit agent._
