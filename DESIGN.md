---
name: Live Luxe Partner Portal
description: A concierge desk for insurers and corporates placing guests in Live Luxe apartments — cream paper, navy ink, one gold action.
colors:
  bg-canvas: "#f4efe6"
  bg-surface: "#fcfaf6"
  bg-surface-raised: "#ffffff"
  bg-inset: "#efe9dd"
  bg-field: "#ffffff"
  border-subtle: "#e9e1d2"
  border-strong: "#8f8a7d"
  border-field: "#7d776a"
  text-primary: "#16243B"
  text-secondary: "#3a4454"
  text-muted: "#5a6373"
  accent-gold: "#D3AC60"
  accent-gold-hover: "#c0994d"
  text-on-gold: "#16243B"
  text-gold: "#866206"
  focus-ring: "#866206"
  status-info-bg: "#eef2f8"
  status-info-fg: "#2b3f63"
  status-info-border: "#c5cfe0"
  status-attention-bg: "#fffbeb"
  status-attention-fg: "#92400e"
  status-attention-border: "#fcd34d"
  status-success-bg: "#ecfdf5"
  status-success-fg: "#047857"
  status-success-border: "#a7f3d0"
  status-danger-bg: "#fef2f2"
  status-danger-fg: "#b42318"
  status-danger-border: "#fecaca"
  status-muted-bg: "#e9e1d2"
  status-muted-fg: "#5a6373"
  status-muted-border: "#d9cdb7"
  harbour-navy: "#16243B"
  navy-deep: "#0d1a31"
  navy-hover: "#223148"
  night-canvas: "#0b1422"
  night-surface: "#16233a"
  night-raised: "#1d2d47"
  night-inset: "#101a2c"
  night-field: "#0c1626"
  night-field-border: "#7486a4"
  night-strong: "#f0ece3"
  night-body: "#c6cbd4"
  night-muted: "#9aa5b6"
  gold-bright: "#e3bc70"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2rem, 1.5rem + 1.5vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.012em"
  h1:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.214
    letterSpacing: "-0.012em"
  h2:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.012em"
  h3:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.467
    letterSpacing: "normal"
  eyebrow:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.455
    letterSpacing: "0.08em"
  body:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-sm:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.538
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.538
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.538
    letterSpacing: "normal"
rounded:
  control: "6px"
  card: "10px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  gutter-mobile: "16px"
  gutter-desktop: "24px"
  control-height: "40px"
  row-height: "56px"
  row-height-dense: "48px"
  max-list: "1280px"
  max-reading: "960px"
components:
  button-primary:
    backgroundColor: "{colors.accent-gold}"
    textColor: "{colors.text-on-gold}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  button-primary-hover:
    backgroundColor: "{colors.accent-gold-hover}"
    textColor: "{colors.text-on-gold}"
  button-secondary:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  button-secondary-hover:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-primary}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "{spacing.control-height}"
  button-destructive:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.status-danger-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  button-destructive-confirm:
    backgroundColor: "{colors.status-danger-fg}"
    textColor: "{colors.bg-surface}"
  input:
    backgroundColor: "{colors.bg-field}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "{spacing.control-height}"
  card:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.card}"
    padding: "{spacing.5}"
  status-pill:
    backgroundColor: "{colors.status-info-bg}"
    textColor: "{colors.status-info-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  banner:
    backgroundColor: "{colors.status-info-bg}"
    textColor: "{colors.status-info-fg}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.text-gold}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  header-partner:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-primary}"
    height: "64px"
  header-ops:
    backgroundColor: "{colors.harbour-navy}"
    textColor: "{colors.night-strong}"
    height: "64px"
---

# Design System: Live Luxe Partner Portal

Reconciled 14 Oct 2026 against the UI/UX Redesign Brief §4 (the brief wins on every visual conflict; the one
exception, the ops environment cue, is recorded in `docs/ux/DECISIONS.md`). The frontmatter carries the light-theme
value of every role; the dark-theme values and the measured contrast of every pair live in the Colors section and
in `.impeccable/design.json`, and move to `DESIGN_TOKENS.md` in Phase 1.

## Overview

**Creative North Star: "The Concierge Desk"**

A well-staffed front desk in a serviced apartment building. The partner (a claims consultant with a family in a
motel tonight, often on the phone, often on a tablet) walks up, says what they need, and it is handled. The surface
is cream paper; the writing is navy ink; there is exactly one gold control in view and it is the thing to do next.
Nothing shouts, nothing is decorative for its own sake, and every figure lines up because the page may be printed
into a claim file an hour later.

Two apps share the system and feel different. The partner portal is the comfortable scale: 15 px body, generous
white space, the best photography treatment, co-brandable with the partner's logo. The operations console is the
dense scale: 13 px in tables, 48 px rows, more columns, keyboard shortcuts, and a header that is unmistakably navy
in every theme so staff never confuse the two sides of the desk.

Two themes, both complete. Components never name a raw colour; they name a role (`bg/surface`, `text/muted`,
`status/attention-fg`) and the role is defined in full for dark and light. Every screen answers, in this order and
at a glance: what needs my attention, what is the state of things, what can I do here.

**Confirmed anti-references:** no new palette; no gold as running text or large fill; no colour-only status; no
"from" prices without dates; no native date inputs; no permanently inline create forms; no internal vocabulary
("Hostaway", "sync", "phase", "fallback") in partner-facing copy.

**Key Characteristics:**

- Cream paper, navy ink, one gold action per view.
- Serif (Newsreader) for display, h1 and h2; sans (DM Sans) for everything else; mono (Geist Mono) for references
  only.
- Three layers you can tell apart: the page (cream by day, harbour navy by night) carrying a faint signature pattern
  at its top (silk by day, gold contour lines by night, `scripts/brand/waves.mjs`); solid cards on it; fields with
  their own fill (white by day, darker than the card by night) and a firm edge. Text never sits on the pattern inside
  a card, table, form or picker.
- Flat surfaces with hairlines; shadow only on raised surfaces in light, a 1 px border in dark.
- 4 px grid; 40 px controls (44 px tap targets on touch); tabular figures on every number.
- One status vocabulary of thirteen labels, five tones, rendered by one component.
- Partner header cream, operations header navy, in both themes.

## Colors

Navy, gold and cream from the brand, bound to the roles in brief §4.1. Every role is defined in both themes; every
text pair below was measured (WCAG 2.x contrast), not eyeballed.

### Primary

- **Harbour Navy** (`{colors.harbour-navy}`): the ink. `text/primary` in light, the operations header in both
  themes, the dark-theme canvas family is built down from it. **Navy Deep** (`{colors.navy-deep}`) is the dark
  canvas anchor and `text/on-gold` in dark; **Navy Hover** (`{colors.navy-hover}`) is the hover of navy surfaces.

### Secondary

- **Antique Gold** (`{colors.accent-gold}`): `accent/gold`. Spent only on action and orientation: the one primary
  button per view, the active-nav indicator, the required-field asterisk, the gold rule under a sign-in eyebrow.
  Never decoration, never a large fill. `accent/gold-hover` darkens it in light (`{colors.accent-gold-hover}`) and
  brightens it in dark (`{colors.gold-bright}`).
- **Text on gold** (`{colors.text-on-gold}`): navy on gold reads at 7.3:1 light, 8.1:1 dark (Navy Deep). White on
  gold reads at 2.1:1 and is forbidden.
- **Gold as text** (`{colors.text-gold}`): eyebrows, active nav text, tertiary links that must be gold. Antique Gold
  itself is 2.0:1 on cream; Gold Ink `#866206` is 5.2:1 on canvas and 5.6:1 on surface. In dark the brighter cut
  `{colors.gold-bright}` is the text colour (8.8:1 on surface).

### Neutral (roles, light / dark)

| Role                | Light     | Dark      | Measured                                                    |
| ------------------- | --------- | --------- | ----------------------------------------------------------- |
| `bg/canvas`         | `#faf7f1` | `#0b1422` | page background; warm off-white, never pure white           |
| `bg/surface`        | `#ffffff` | `#16233a` | every card, table, sheet; fixes the Invoices page           |
| `bg/surface-raised` | `#ffffff` | `#1d2d47` | popovers, dialogs, menus; shadow in light, 1 px border dark |
| `bg/inset`          | `#f4efe6` | `#101a2c` | inputs, code, muted wells                                   |
| `border/subtle`     | `#e9e1d2` | `#26354e` | dividers; 1.3:1 light, 1.27:1 dark (visible, decorative)    |
| `border/strong`     | `#8f8a7d` | `#6c7f9e` | hovered/focused borders and input edges; ≥ 3:1 on surface   |
| `text/primary`      | `#16243B` | `#f0ece3` | 15.6:1 light, 13.3:1 dark on surface (brief asks ≥ 7:1)     |
| `text/secondary`    | `#3a4454` | `#c6cbd4` | 9.8:1 / 9.7:1 on surface (≥ 4.5:1)                          |
| `text/muted`        | `#5a6373` | `#9aa5b6` | 6.1:1 / 6.3:1 on surface, 5.3:1 / 7.0:1 on inset (≥ 4.5:1)  |
| `focus/ring`        | `#866206` | `#D3AC60` | 2 px ring + 2 px canvas offset, `:focus-visible` only       |

The dark muted text was `#8d97a6` (5.4:1); the brief flagged it as too dark, so it moves to `#9aa5b6`. Antique Gold
as a ring on light surfaces reads at only 2.0:1, so the light-theme ring is Gold Ink (5.2:1); dark keeps Antique
Gold (7.4:1 on surface). Recorded in DECISIONS.md.

### Status (five tones; each with `-bg`, `-fg`, `-border`)

| Tone        | Light bg / fg / border            | Dark bg / fg / border             | fg on bg (L / D) |
| ----------- | --------------------------------- | --------------------------------- | ---------------- |
| `info`      | `#eef2f8` / `#2b3f63` / `#c5cfe0` | `#1b2a45` / `#b9c7e2` / `#2f4468` | 9.4 / 8.4        |
| `attention` | `#fffbeb` / `#92400e` / `#fcd34d` | `#33270c` / `#fbbf24` / `#5c4414` | 6.8 / 8.8        |
| `success`   | `#ecfdf5` / `#047857` / `#a7f3d0` | `#0f2f28` / `#6ee7b7` / `#1f5247` | 5.2 / 9.5        |
| `danger`    | `#fef2f2` / `#b42318` / `#fecaca` | `#38181a` / `#fca5a5` / `#5e2a2c` | 6.0 / 8.4        |
| `muted`     | `#e9e1d2` / `#5a6373` / `#d9cdb7` | `#1d2d47` / `#a6afbd` / `#35486a` | 4.7 / 6.3        |

`info` is a navy tint (no new hue was introduced); `attention` is the existing amber; status borders are tints that
sit inside the pill's own background and are not UI boundaries, so the 3:1 boundary rule applies to `border/strong`
and `focus/ring`, not to them. Every tone is always paired with a word.

### Named Rules

**The Gold Is Not Ink Rule.** Antique Gold is a fill and an indicator. Text that must be gold uses `text/gold`
(Gold Ink in light, Gold Bright in dark). Never Antique Gold text on a light surface.

**The One Gold Action Rule.** Exactly one gold-filled control per view, and it is the primary action (Sign in,
Search, Get price, Request this property, Submit request, Approve, Create partner, Publish version, Send invitation,
Pay now). Everything else is secondary, tertiary or destructive.

**The Role Not Colour Rule.** Components reference roles, never a hex and never a Tailwind palette colour. A lint
rule fails the build on raw colour in `app/` and `components/` (Phase 1).

**The Navy Side Rule.** The operations header is Harbour Navy in both themes with Gold Bright for its eyebrow and
active underline; the partner header is `bg/inset` in both themes. This is the environment cue, in place of the
brief's 2 px gold rule (DECISIONS.md #1).

**The Outcome Is Not an Alarm Rule.** Declined, Expired and Cancelled render in `muted`. `danger` is reserved for
Failed and for a breached SLA on a live request.

## Typography

**Display Font:** Newsreader (variable, optical size axis; fallback Georgia, "Times New Roman", serif)
**Body Font:** DM Sans (variable, optical size axis; fallback ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (fallback ui-monospace)

**Character:** A literary serif set slightly tight over a warm, plain-spoken sans. The serif carries the premium
operator's voice on titles only; the sans does the work, at 15 px because an operational tool is read for hours.
Two families, four weights in total (serif 500; sans 400 and 600, plus mono 400), `font-display: swap`, preloaded.

### Hierarchy (brief §4.2)

- **Display** (serif 500, 40/44 desktop, 32/36 mobile): the sign-in headline only.
- **h1** (serif 500, 28/34): page title, one per page, under an eyebrow.
- **h2** (serif 500, 20/28): card and section titles.
- **h3** (sans 600, 15/22): table group headers, form sections.
- **Eyebrow** (sans 600, 11/16, 0.08em, uppercase, `text/gold`): section context above an h1 ("Operations",
  "Finance", "Booking request").
- **Body** (sans 400, 15/24): the default everywhere on the partner side and in ops prose.
- **Body-sm** (sans 400, 13/20): table cells (default in the ops console), captions, secondary metadata.
- **Label** (sans 600, 13/20): field labels, pills, column heads (sentence case; no uppercase except eyebrows).
- **Mono** (13/20): references and IDs only (`LLX-2026-000005`, `CLM-2026-0045`), uppercase, with a copy button.
- **Numeric**: every amount, count, date and time in a table or KPI uses `font-variant-numeric: tabular-nums`.

### Named Rules

**The Serif Is a Title Rule.** Newsreader sets display, h1, h2, the wordmark and KPI figures. It never sets body
copy, labels, buttons, pills or table cells.

**The Sentence Case Rule.** Sentence case everywhere: nav, buttons, pills, table headers ("Rate cards", "Under
review", "Send invitation"). Only eyebrows are uppercase.

## Layout

A 4 px base grid. Page gutter 24 px on desktop, 16 px on mobile. Content max-width 1280 px for lists, 960 px for
forms and detail reading columns; the ops console may use up to 1440 px for tables at ≥ 1280 px, where extra
columns appear. The header is 64 px tall and sticky.

Detail screens (request detail, property detail) split 2/1 (request) or 8/4 (property) at ≥ 1024 px with the
action or price panel sticky on the right; below 1024 px they stack and the panel becomes a sticky bottom bar that
opens a sheet. Right rails on dashboards appear at ≥ 1280 px and move below the content otherwise. Search results
run 3 columns at ≥ 1280 px, 2 at ≥ 768 px, 1 below, or a 55/45 list-and-map split where a map exists.

Below 640 px the partner nav collapses to a bottom tab bar (Dashboard, Search, Requests, More); the ops nav goes
into a drawer. Below 768 px every table becomes a card list with the same component API; operational data never
scrolls horizontally. Primary actions on phones sit in a sticky footer within thumb reach.

Lead with attention, then state, then action: a "Needs your attention" strip or count first, then KPIs and lists,
then filters and forms. Create, invite and publish forms open on demand in a right-side Sheet (≥ 1024 px) or a
full-screen Dialog (below); the list is the page.

## Elevation & Depth

Flat by default. In light, surfaces are white on cream with a 1 px `border/subtle` hairline and no shadow at rest;
one soft shadow scale is used only for `bg/surface-raised` (popovers, menus, dialogs) and the sticky header. In
dark there are no shadows at all: raised surfaces are a lighter step plus a 1 px border.

### Shadow Vocabulary (light theme only)

- **raised** (`0 4px 14px rgb(22 36 59 / 0.08)`): popovers, dropdown menus, the mobile sheet.
- **dialog** (`0 16px 40px rgb(22 36 59 / 0.12)`): modal dialogs.
- **header** (`0 1px 3px rgb(22 36 59 / 0.07)`): the sticky header once the page has scrolled.

Shadow colour is the brand navy at low alpha, never neutral black, so lifted surfaces stay warm against cream.

### Named Rules

**The Flat-By-Default Rule.** A card never carries a shadow at rest. A surface lifts because it is above the page,
not because it is important.

## Shapes

Three radii and no others: 6 px on controls (buttons, inputs, selects, chips), 10 px on cards, sheets and dialogs,
999 px on pills. Borders are 1 px hairlines in `border/subtle`; `border/strong` on hover and focus. Images clip to
the card radius. The gold rule under the sign-in eyebrow is a 56 × 2 px bar. Icons are lucide-react only, 16 px in
text and table cells, 20 px in buttons and nav, always named or `aria-hidden`.

## Components

Refined and restrained. Hover is a quiet tint, press is a brief 97 % scale, focus is a 2 px ring with a 2 px canvas
offset on `:focus-visible` only. Motion: 150 ms ease-out for hover and focus, 200 ms for sheets and dialogs, 250 ms
maximum for list reorder; everything honours `prefers-reduced-motion`.

### Buttons (exactly four kinds, brief §4.4)

- **Shape:** 6 px radius, 40 px tall (44 px minimum tap target on touch via padding), 15 px sans 600 text, sentence
  case, verbs with an object ("Request this property", "Send invitation", "Publish version"). Never "Submit",
  "OK", "Yes".
- **Primary:** Antique Gold fill, navy text. One per view.
- **Secondary:** outlined (`border/strong`) on `bg/surface`, `text/primary`; hover tints to `bg/inset`. Filter,
  Refresh, Export, Counter-offer, Reset password.
- **Tertiary:** text only, `text/primary`, underlined on hover. Cancel, Back, "All requests →", in-row actions.
- **Destructive:** outlined in `status/danger-fg`; fills danger only inside its confirmation dialog. Decline, Cancel
  booking, Remove user, Revoke.
- **States:** loading replaces the label with a spinner at the same width (no layout shift); disabled is 50 %
  opacity with a tooltip when the reason is situational; active scales to 0.97.

### Inputs / Fields (brief §4.5)

- **Style:** `bg/inset` fill, 1 px `border/strong` edge, 6 px radius, 40 px tall, 15 px text in `text/primary`.
  Label above, 13 px semibold; helper text below in `text/muted`; required marked with a gold asterisk and
  `aria-required`.
- **Focus:** 2 px `focus/ring` with 2 px canvas offset.
- **Error:** field outlined in `status/danger-fg`, message beneath in `status/danger-fg` with a 16 px icon; a
  form-level error at the top carries the request ID.
- **Dates:** shadcn Calendar in a Popover, range mode, nights shown live ("5 nights"), property-local. Native date
  inputs are not acceptable anywhere.
- **Selects:** Radix Select, wide enough for the longest option; options needing explanation get a second line in
  `text/muted`. **Money:** `AUD` prefix inside the field, right-aligned, tabular; percentages with a `%` suffix.
  Repeating structures are row editors with Add/Remove, never delimited text.
- **Conditional fields** appear only when their condition is met; the condition is never encoded in the label.

### Status pills and badges (brief §4.6)

- **StatusPill:** one component takes a status code and renders the §2.3 label and tone. 999 px radius, 13 px
  semibold, 2 × 10 px padding, `-bg` fill, `-fg` text, `-border` edge. Draft neutral (muted), Submitted and Under
  review info, Counter-offer and Awaiting payment attention, Approved (soft), Confirmed and Checked in success,
  Completed neutral, Declined, Expired and Cancelled muted, Failed danger. No screen renders its own pill.
- **SlaBadge:** renders nothing unless the clock is running; "Due in 2 h 10 m" (info), "Due in 40 m" (attention),
  "Overdue by 1 d 2 h" (danger); "Waiting on partner since 11:40 am AEDT" when paused.
- **SyncState:** dot plus text, exactly one per page: live (success, "Availability confirmed 2 min ago"), delayed
  (attention, "Sync delayed — last confirmed 9:12 am AEDT"), degraded (danger, "Hostaway connection lost — showing
  cached data" in ops; "Live availability is temporarily unavailable" to partners).
- **FreshnessChip:** prices ("Priced 14 Oct, 9:40 am AEDT · expires in 46 h").

### Tables (brief §4.7)

- **DataTable** renders a real `<table>` above 768 px and a card list below, same API. Sticky header, sortable
  columns with an explicit indicator, default sort stated in the subtitle ("Ordered by decision deadline").
- Rows 56 px (48 px in the ops console); the whole row is a focusable link with a visible hover background; the
  identity cell (reference in mono + secondary line) is also a real `<a>`. Numeric columns right-aligned and
  tabular; stays as `Tue 25 Nov 2026 → Sun 30 Nov 2026` with `5 nights` beneath; last column is status; actions in
  a trailing kebab or inline tertiary links on hover and focus.
- Pagination with page size (25/50/100) and a result count. Filters above apply live with an applied-filters chip
  row and Clear all; the filter row is hidden on an empty list with no filters applied. Bulk selection only on
  lists with bulk actions (Queue).

### Cards, banners, toasts, empty states (brief §4.8)

- **Card:** `bg/surface`, 10 px radius, 1 px `border/subtle`, 20 px padding, h2 title. No card inside a card.
- **KPI card:** label, large tabular serif number, one-line meaning, optional delta; the whole card links to its
  filtered list. "0" is a value with its meaning line, not an empty state.
- **Banner:** one per page maximum, top of content, tone from the status set, with a timestamp and a single action;
  dismissible only when informational. 10 px radius, 12 × 16 px padding, leading 16 px icon.
- **Toast:** bottom-right, 5 s, confirmations of the user's own actions only; errors go inline.
- **EmptyState:** icon, one sentence of what would be here, one of how it gets here, and the primary action if the
  user can create it. **ErrorState:** what happened, what it means, what to do, plus the request ID.
- **ConfirmDialog:** for every irreversible action, listing exactly what will happen as bullets ("Capture AUD
  $1,694.00 on Visa ••4417", "Create the reservation in Hostaway", "Email Dana Partner and ops@").

### Navigation and shells (brief §6.1, §7.1)

- **Partner header:** `Live Luxe · Partner portal` lockup (serif wordmark + eyebrow), nav Dashboard, Search,
  Requests, Invoices, Team, Settings (role-gated), then co-brand logo slot, SyncState dot, theme toggle and an
  account menu (name, org, role, Sign out). The org name lives in the account menu, not loose in the header.
- **Operations header:** `Live Luxe · Operations` lockup on fixed Harbour Navy in both themes, nav Queue (with a
  live-count badge, danger when any breached), Bookings, Partners, Rate cards, Settings; right side sync dot, theme
  toggle, account menu. No "Operations console / email · role" text block.
- **Active nav item:** `text/gold` text with a 2 px gold underline; hover `text/primary`; `:focus-visible` ring only.
  No pill outlines.
- **Footer (partner):** entity, ABN, confidentiality line, and a "Contact Live Luxe" popover with phone and email.

### Wordmark

"Live Luxe" set in Newsreader at 22 px, `text/primary` on the partner header and `night/strong` on navy, with the
eyebrow descriptor beside it. This text wordmark is the logo; there is no graphic mark.

## Do's and Don'ts

### Do:

- **Do** put exactly one gold primary on every view and make it the verb the visitor came for.
- **Do** set gold text in `text/gold`; keep Antique Gold for fills, the active-nav underline and the required
  asterisk.
- **Do** define every token for both themes and use `bg/surface` for every card, table and sheet.
- **Do** render every status through StatusPill with the §2.3 label, and show the SLA badge only while the clock
  runs.
- **Do** show stays as `Tue 25 Nov 2026 → Sun 30 Nov 2026 · 5 nights`, timestamps with their timezone, money as
  `AUD $1,694.00`, references in mono with a copy button.
- **Do** carry a SyncState line wherever availability, price or sync-dependent figures appear, and only one per
  page.
- **Do** keep controls 40 px tall with 44 px tap targets on touch, and tables as card lists below 768 px.
- **Do** open create, invite and publish forms in a Sheet from a primary button in the page header.

### Don't:

- **Don't** use a Tailwind palette colour, a raw hex or an arbitrary colour in `app/` or `components/`.
- **Don't** use red for Declined, Expired or Cancelled; they are outcomes in `muted`.
- **Don't** show a price without dates, a "from" price, or a placeholder price.
- **Don't** use native `<input type="date">`, delimited-text editors for repeating data, or truncating selects.
- **Don't** set body copy, labels, buttons, pills or table cells in the serif.
- **Don't** add shadows to cards at rest, use neutral-black shadows, or use shadows at all in the dark theme
  except on raised surfaces.
- **Don't** ship internal vocabulary or development notes in partner-facing copy ("Hostaway", "sync", "phase",
  "fallback", "tunables"), exclamation marks, "successfully", or guest names in page titles and feeds.
- **Don't** leave a focus ring after a mouse click; `:focus-visible` only.
