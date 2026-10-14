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

Run as two isolated design-review agents (partner + auth, operations), each blind to the other and to the detector
output. Scores are Nielsen's ten heuristics, 0–4 each; `n/a` only where a heuristic cannot apply. The four
admin-only routes (partners, partner detail, rate cards, rate-card detail) were first captured as redirects because
the ops test account lacks `partners.manage` / `rate_cards.manage`; they were re-captured with a temporary admin role
and the account restored (DECISIONS.md #14). Full agent reports are archived in the session; the substance is below.

### 3.1 Scores

| Route                   | Score | Lowest heuristics                                           |
| ----------------------- | ----- | ----------------------------------------------------------- |
| login                   | 31/40 | consistency (navy primary), help                            |
| login-error             | 30/40 | consistency, error prevention (email cleared on bounce)     |
| reset-password          | 32/40 | consistency                                                 |
| reset-password-confirm  | 30/40 | user control (no way out once the link is exchanged)        |
| invite-token-invalid    | 27/36 | user control, flexibility (dead end for expired links)      |
| not-found               | 32/36 | consistency (no gold primary)                               |
| dashboard               | 26/40 | minimalism (four ways to start a search), consistency       |
| search                  | 24/40 | match (from-prices), error prevention (native dates)        |
| search-dates            | 26/40 | consistency, error prevention                               |
| listing                 | 25/40 | minimalism (description, 60 amenities, calendar all open)   |
| listing-priced          | 25/40 | error recovery (unavailable result has no next step)        |
| requests                | 29/40 | flexibility (no search), recognition (KPI links ignored)    |
| request-approved        | 22/40 | minimalism (four stacked panels), consistency               |
| request-cancelled       | 25/36 | consistency (amber banner, green paid panel)                |
| request-declined        | 26/36 | consistency (red alert for an outcome)                      |
| request-new             | 28/40 | error prevention (form renders for an unpriceable stay)     |
| request-pay             | 27/40 | consistency (legacy scale classes, dark broken)             |
| request-not-found       | 32/36 | —                                                           |
| invoices                | 24/36 | consistency (theme broken), recognition                     |
| team                    | 29/40 | minimalism (inline invite), flexibility                     |
| settings                | 29/40 | consistency, help (Phase 2 note)                            |
| admin-queue             | 19/40 | flexibility (0: no keyboard, no inline triage), help        |
| admin-bookings          | 16/40 | match (false SLA alarms), minimalism                        |
| admin-booking-approved  | 20/40 | consistency (white payment panel in dark)                   |
| admin-booking-cancelled | 22/40 | consistency                                                 |
| admin-partners          | 14/40 | visibility, recognition, error prevention                   |
| admin-partner           | 17/40 | visibility (no overview), error prevention                  |
| admin-rate-cards        | 18/40 | flexibility, help                                           |
| admin-rate-card         | 15/40 | control, error prevention (publish without preview/confirm) |
| admin-settings          | 25/40 | help (Phase 3 note)                                         |
| admin-not-found         | 17/40 | match, control (renders partner chrome, see 3.3)            |

Partner side averages 27.6/40 ("acceptable"); the ops console 18.3/40 ("poor"). The brief's instinct to spend
disproportionate effort on the Queue (§6.3) is confirmed by the numbers.

### 3.2 Design-specificity verdict

- **Partner portal:** the voice is authored for insurers (AEDT on every timestamp, claim/PO/cost centre as
  first-class fields, honest refund lines, the address-disclosure sentence); the structure is generic SaaS. Nothing in
  the layout says "the family is in a motel tonight": the dashboard does not lead with what needs Dana now, search
  does not lead with the stay total, the request page does not lead with the next action.
- **Operations console:** a well-built admin template in Live Luxe colours, not an operations desk. Breach-first
  strip, next-step column, inline triage, keyboard flow, publish preview and an "anything wrong" partner signal are
  all absent. With zero requests the Queue shows three filter controls and nothing else.

### 3.3 Priority issues found beyond §3 (P0–P1)

| Sev | Issue                                                                                                                                                                                                                           | Where                                                                             | Fixed by    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| P0  | **Dead links:** "New request on behalf of…" and "Request a manual search" go to `/requests/new?onBehalf=1` / `?manual=1`, which `notFound()` without `listingId` and dates.                                                     | `app/(portal)/page.tsx`, `requests/new/page.tsx`                                  | §7.2, §11.3 |
| P0  | **Payment panel contradicts the state:** an APPROVED invoice-terms request reads "No card hold yet. Live Luxe can only approve once a card is on file." in a gold-bordered white box (invisible heading in dark).               | `components/payments/payment-panel.tsx`                                           | §8.5, §4.1  |
| P0  | **Rate-card publish** has no preview and no confirmation; tiers are `nights:percent` text. The highest-risk screen in the console.                                                                                              | `components/admin/rate-card-form.tsx`                                             | §6.6        |
| P0  | **Queue summary:** no KPI strip; the nav carries no live count.                                                                                                                                                                 | `app/(admin)/admin/queue/page.tsx`                                                | §6.3, §6.1  |
| P1  | **KPI tiles link to query params `/requests` ignores** (`?status=active`, `?window=checkin-7d`); every tile lands on "Open".                                                                                                    | `components/dashboard/kpi-row.tsx`, `app/(portal)/requests/page.tsx`              | §7.2, §7.6  |
| P1  | **Admin 404 renders partner chrome:** a mistyped `/admin/…` URL shows the root not-found with "Partner portal" wordmark and "Back to the portal"; `app/(admin)/not-found.tsx` is only reached by `notFound()` inside the group. | `app/not-found.tsx`, `app/(admin)/not-found.tsx`                                  | §6.1, §9    |
| P1  | **Outcome tones disagree on one page:** Cancelled banner amber + pill muted + payment panel green "Paid"; Declined banner red `role="alert"` + pill muted.                                                                      | request detail (both sides)                                                       | §2.3, §4.6  |
| P1  | **Up to six banners stack** above content on request detail; brief allows one.                                                                                                                                                  | `app/(admin)/admin/bookings/[id]/page.tsx`, `app/(portal)/requests/[id]/page.tsx` | §4.8, §8    |
| P1  | **Email cleared on a failed sign-in; reset-confirm has no exit** once the recovery session is exchanged.                                                                                                                        | `app/(marketing)/login`, `reset-password/confirm`                                 | §6.2, §5.8  |
| P1  | **Quote copy undermines the number:** "Indicative… GST at the placeholder rate pending accountant sign-off" on the listing and new-request pages.                                                                               | `components/listings/quote-panel.tsx`, `requests/new/page.tsx`                    | §11.2       |
| P1  | **New-request form renders in full for a stay that can no longer be priced** (seven enabled fields, disabled submit).                                                                                                           | `app/(portal)/requests/new/page.tsx`                                              | §9.1        |
| P1  | **Phone chrome:** ~108 px sticky header (nav strip inside it) clips the last nav item ("Set…", "Tea…"); a fixed Search FAB overlaps dashboard content.                                                                          | `app-shell.tsx`, `nav-links.tsx`, `app/(portal)/page.tsx`                         | §10.1       |
| P1  | **Search card totals are "before fees"** while the property page total includes them; partners carry two numbers.                                                                                                               | `components/search/result-card.tsx`                                               | §7.3        |
| P1  | **Partner listing description parser** leaves ALL-CAPS section headings glued to list items, so the spec-sheet layout never triggers.                                                                                           | `components/listings/description.tsx`                                             | §7.4        |

### 3.4 Kept on purpose (strengths both reviews named)

Sign-in's calm copy and split layout; the "Needs your attention" strip that renders nothing when empty; the
"Due / next step" idea on the dashboard; AEDT on every timestamp; claim/PO/cost centre on the request form; the
address-disclosure line; the dated search summary sentence; the house-rules numbered list; `StayCard`'s
`Mon 9 Nov 2026 → Thu 12 Nov 2026 · 3 nights`; the cancellation sentence "Refund AUD $1,837.00 · retained AUD
$0.00 under the cancellation policy"; URL-backed filters; the invite-link-shown-once pattern; the rate-card helper
sentence on what publishing does to issued quotes.

## 4. Technical audit (`/impeccable audit`)

Run as a code-level agent across both apps, with contrast computed from the hex values in `globals.css` (alpha
composited over its surface).

| Dimension                   | Score     | Key finding                                                                                                                             |
| --------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility (WCAG 2.2 AA) | 2         | Token pairs pass; hard-coded light surfaces in dark give 1.2:1 headings; input edges 1.6–1.7:1; colour-only invalid fields in two forms |
| Performance                 | 3         | 13 client files / 776 lines, Stripe only on `/pay`; raw `<img>` without dimensions or srcset; 60 s refresh loops                        |
| Theming                     | 2         | Sound role layer, bypassed by 8 hex, 27 palette and ~40 brand-scale class uses in six files                                             |
| Responsive                  | 3         | Card lists for request tables; partners, rate cards, invoices, team still scroll sideways at 390                                        |
| Implementation integrity    | 2         | Two primary looks, seven status→tone maps, 21 hand-rolled pills, seven table implementations, four inline forms                         |
| **Total**                   | **12/20** | **Acceptable — solid foundation, undermined by bypasses**                                                                               |

Verdict: **fail (conditional)** — drift, not template-ness. Every dark-theme defect is one defect: a light surface
hard-coded under text that follows the theme.

### 4.1 Findings (P0–P2), with location

| Sev | Finding                                                                                                   | Location                                             | Status after Phase 1                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P0  | Payment panel heading 1.18:1 in dark (white box, theme-following heading)                                 | `payment-panel.tsx:45`                               | open (screen)                                                                            |
| P0  | Invoices table 1.63:1 in dark                                                                             | `invoices/page.tsx:37-78`                            | open (screen)                                                                            |
| P1  | Pay page sections white with theme text                                                                   | `requests/[id]/pay/page.tsx`                         | open (screen)                                                                            |
| P1  | Invalid state colour-only in partner and rate-card forms (no `aria-invalid`, no per-field message)        | `partner-form.tsx`, `rate-card-form.tsx`             | open (screen)                                                                            |
| P1  | Disabled pagination links still keyboard-activatable (`?page=0`)                                          | `list-pagination.tsx:61-77`, `search/pagination.tsx` | open                                                                                     |
| P1  | Input and outline-button edges 1.57:1 light / 1.71:1 dark                                                 | `globals.css`                                        | **fixed**: `border/strong` 3.4:1 / 3.6:1                                                 |
| P1  | `aria-live` freshness line re-announces every 15 s                                                        | `components/requests/freshness.tsx:69-85`            | open                                                                                     |
| P1  | Twelve native date inputs                                                                                 | six files                                            | open (Phase 1 Calendar)                                                                  |
| P2  | Error hints inside `<label>` become part of the field name; no `aria-describedby`; 79 labels, 0 `htmlFor` | `requests/new/page.tsx`, `people-panel.tsx`          | open (Phase 1 Field)                                                                     |
| P2  | Reduced-motion rule left infinite animations running at 0.01 ms                                           | `globals.css`                                        | **fixed**: animations off, transitions 0 ms, transforms none                             |
| P2  | Placeholder text 3.87:1 / 3.93:1                                                                          | `globals.css`                                        | **fixed**: unmixed `text/muted`, 5.3:1 / 7.0:1 on inset                                  |
| P2  | Light focus ring at the 3:1 floor                                                                         | `globals.css`                                        | **fixed**: Gold Ink, 5.2:1                                                               |
| P2  | Pending submit changes button width                                                                       | `submit-button.tsx`                                  | **fixed**: spinner overlays a hidden label                                               |
| P2  | Stripe Element themed with raw light hex, ignores dark                                                    | `payment-form.tsx:114`                               | **fixed**: resolved from role tokens at mount                                            |
| P2  | Raw hex, palette and arbitrary colours                                                                    | 8 / 27 / 0 uses                                      | **fixed**: 0 / 0 / 0; lint rule enforces                                                 |
| P2  | Status semantics modelled seven times                                                                     | see Implementation verdict                           | partly: one `statusTone` + `StatusPill`/`Pill`/`SlaBadge`; call sites migrate in Phase 2 |
| P2  | Raw `<img>` without dimensions or srcset; first result images lazy                                        | `result-card.tsx`, `gallery.tsx`, `stay-card.tsx`    | open (NEEDS_BACKEND: Hostaway CDN remote patterns)                                       |
| P2  | `<th>` without `scope`, tables without captions                                                           | `requests-table.tsx`, `invoices/page.tsx`            | `DataTable` has both; call sites migrate in Phase 2                                      |
| P2  | 60 s `router.refresh()` per open ops tab with no change check                                             | `freshness.tsx:51-65`                                | open                                                                                     |
| P2  | Fonts load full variable axes; three families                                                             | `app/layout.tsx`                                     | open                                                                                     |

### 4.2 False positives

- Detector `border-accent-on-rounded` at `requests/page.tsx:58` is a tab underline, not a card border.
- Detector `design-system-font-size` at `brand.tsx:22` is the wordmark, which DESIGN.md sets at 22 px.
- C2 "focus ring stays after click": nav already uses `:focus-visible`; the real gap was the sign-out button with no
  author focus style. The global `:focus-visible` rule added in Phase 1 covers it.
