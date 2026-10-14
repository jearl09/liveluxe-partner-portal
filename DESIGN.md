---
name: Live Luxe Partner Portal
description: A concierge desk for insurers and corporates placing guests in Live Luxe apartments — cream paper, navy ink, one gold detail.
colors:
  harbour-navy: "#16243B"
  navy-deep: "#0d1a31"
  navy-hover: "#223148"
  navy-soft: "#33435c"
  antique-gold: "#D3AC60"
  gold-hover: "#c0994d"
  gold-bright: "#e3bc70"
  gold-ink: "#866206"
  cream-paper: "#faf7f1"
  cream-100: "#f4efe6"
  cream-200: "#e9e1d2"
  cream-300: "#d9cdb7"
  white: "#ffffff"
  ink-900: "#141a24"
  ink-700: "#3a4454"
  ink-500: "#5a6373"
  ok: "#047857"
  ok-bg: "#ecfdf5"
  ok-border: "#a7f3d0"
  warn: "#92400e"
  warn-bg: "#fffbeb"
  warn-border: "#fcd34d"
  bad: "#b42318"
  bad-bg: "#fef2f2"
  bad-border: "#fecaca"
  night-canvas: "#0b1422"
  night-surface: "#16233a"
  night-raised: "#1d2d47"
  night-line: "#26354e"
  night-strong: "#f0ece3"
  night-body: "#c6cbd4"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "2.25rem"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  body:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "normal"
  eyebrow:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.18em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "normal"
rounded:
  sm: "0.5rem"
  md: "0.625rem"
  lg: "0.875rem"
  xl: "1.125rem"
  2xl: "1.375rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  panel: "1.25rem"
  lg: "1.5rem"
  xl: "2rem"
  control: "2.75rem"
  header: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.harbour-navy}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "{spacing.control}"
  button-primary-hover:
    backgroundColor: "{colors.navy-hover}"
    textColor: "{colors.white}"
  button-gold:
    backgroundColor: "{colors.antique-gold}"
    textColor: "{colors.navy-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "{spacing.control}"
  button-gold-hover:
    backgroundColor: "{colors.gold-hover}"
    textColor: "{colors.navy-deep}"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.harbour-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "{spacing.control}"
  button-outline-hover:
    backgroundColor: "{colors.cream-100}"
    textColor: "{colors.harbour-navy}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-700}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "{spacing.control}"
  button-destructive:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "{spacing.control}"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.gold-ink}"
    typography: "{typography.body}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.harbour-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.control}"
  panel:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-700}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  pill-status-confirmed:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
  pill-status-review:
    backgroundColor: "{colors.white}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
  banner-info:
    backgroundColor: "{colors.cream-100}"
    textColor: "{colors.ink-700}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.harbour-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
  header-partner:
    backgroundColor: "{colors.cream-100}"
    textColor: "{colors.harbour-navy}"
    height: "{spacing.header}"
  header-ops:
    backgroundColor: "{colors.harbour-navy}"
    textColor: "{colors.white}"
    height: "{spacing.header}"
---

# Design System: Live Luxe Partner Portal

## Overview

**Creative North Star: "The Concierge Desk"**

A well-staffed front desk in a serviced apartment building. The partner (an insurance claims officer with a family
in a motel tonight) walks up, says what they need, and it is handled. The surface is cream paper; the writing is navy
ink; there is exactly one gold detail in view, and it marks the thing to do next. Nothing shouts, nothing is
decorative for its own sake, and every figure lines up because the page may be printed into a claim file an hour
later.

The system is an Operate-mode product UI wearing a premium operator's identity. Density is moderate: one subject per
panel, generous panel padding (1.25rem), 44 px controls, tables that become card lists on a phone. The craft is
borrowed from Apple's Human Interface Guidelines (surface layering, modest radii, a single press curve, restraint in
shadow) so the portal reads as a native tool, not a web template. Brand lives in precise details: the serif heading,
the gold eyebrow and underline, the navy ops header, the cream partner header.

Two themes exist. Components never name a raw colour; they name a role (card, border, strong, muted-foreground) and
the role is remapped for dark mode and for print. The ops console header stays navy in every theme so staff always
know which side of the desk they are on.

**Confirmed anti-references:** no startup gradients or glassy hero blocks; no gold as running text; no colour-only
status; no decorative photography inside the operational screens (photos belong to listings only).

**Key Characteristics:**

- Cream paper, navy ink, one gold detail per screen.
- Serif display (Newsreader) over a humanist sans (DM Sans); mono (Geist Mono) only for references and codes.
- Flat, hairline-bordered white panels on cream; shadow reserved for things that lift.
- 44 px touch floor on every control; tabular figures everywhere numbers appear.
- Status is always a labelled pill, never a bare colour.
- Partner chrome cream, Live Luxe operations chrome navy, in both light and dark themes.

## Colors

Navy, gold and cream from the Live Luxe brand, with a cool ink scale for text and three unmistakable status triads.

### Primary

- **Harbour Navy** (`{colors.harbour-navy}`): the ink of the system. Headings, primary buttons, the ops header, strong
  text. Docklands water at dusk, not corporate blue. **Navy Deep** is the text colour on gold fills and the dark
  canvas anchor; **Navy Hover** is the only hover state a primary button has; **Navy Soft** is for secondary navy
  surfaces (maps, muted icons on navy).

### Secondary

- **Antique Gold** (`{colors.antique-gold}`): aged brass, not jewellery. Used as a fill (the one gold button, the
  pressed status pill, the active-nav underline, the gold rule under a hero eyebrow), as a border, and as the focus
  ring. **Gold Hover** darkens it under the pointer. **Gold Bright** is the dark-theme substitute, where the surface is
  navy and the brighter cut is the readable one.
- **Gold Ink** (`{colors.gold-ink}`): gold as _text_ on light surfaces (eyebrows, link buttons, "under review" pills).
  Antique Gold itself reads at 2.0:1 on cream, so it is never typeset; Gold Ink reads at 5.2:1.

### Neutral

- **Cream Paper** (`{colors.cream-paper}`): the page background in the light theme. **Cream 100** is the partner
  header, muted surfaces and secondary buttons; **Cream 200** is every hairline border and the sunken well; **Cream
  300** is the input border, one step darker so fields are findable on a cream page.
- **White** (`{colors.white}`): every panel, card, popover and field. Content sits on white; the page sits on cream.
- **Ink 900 / 700 / 500**: display black, running text, and muted text respectively. Ink 500 is the lightest text
  allowed on cream (4.7:1 on Cream 200, the darkest light surface it sits on).
- **Night** surfaces (`night-canvas`, `night-surface`, `night-raised`, `night-line`, `night-strong`, `night-body`):
  the dark theme, built down from the brand navy so the hue never drifts. Depth in the dark theme comes from a
  lighter surface plus a hairline, not shadow.

### Status

- **Ok** (`{colors.ok}` on `{colors.ok-bg}`, edge `{colors.ok-border}`): confirmed, paid, on track.
- **Warn** (`{colors.warn}` / `{colors.warn-bg}` / `{colors.warn-border}`): at risk, awaiting payment, needs approval.
- **Bad** (`{colors.bad}` / `{colors.bad-bg}` / `{colors.bad-border}`): breached, declined, failed, destructive.

### Named Rules

**The Gold Is Not Ink Rule.** Antique Gold is a fill, border and ring colour. As text on any light surface it fails
contrast, so text that must be gold uses Gold Ink. On navy, Antique Gold is the text colour (7.3:1).

**The One Gold Action Rule.** At most one gold-filled control per screen: the thing the visitor came to do (Submit
request, Accept the proposal, Secure with a card hold). Everything else is navy, outline or ghost.

**The Role Not Colour Rule.** Components reference roles (`card`, `border`, `strong`, `muted-foreground`, `accent`),
never a brand hex. Dark mode and print are 25-line remaps, not rewrites.

**The Navy Side Rule.** The operations header is Harbour Navy in both themes; the partner header is cream in light and
night-surface in dark. The two sides of the desk must never look the same.

## Typography

**Display Font:** Newsreader (variable, optical size axis; fallback Georgia, "Times New Roman", serif)
**Body Font:** DM Sans (variable, optical size axis; fallback ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (fallback ui-monospace)

**Character:** A literary serif set slightly tight over a warm, plain-spoken sans. The serif carries the premium
operator's voice in headings only; the sans does all the work. Optical sizing gives headings the finer display cut
and small labels the sturdier text cut from the same families.

### Hierarchy

- **Display** (500, 2.25rem, 1.12, −0.012em): the dashboard KPI number and the one hero figure on a page (a quote
  total). Serif, Harbour Navy.
- **Headline** (500, 1.875rem, 1.12, −0.012em): page title (`h1`), one per page, under a gold eyebrow. `text-wrap:
balance`.
- **Title** (500, 1.25rem, 1.25): panel heading (`h2`) and the property name on a stay card. Serif.
- **Body** (400, 0.875rem, 1.25rem line): everything else. Running prose wraps `pretty`; data lists and tables use
  tabular figures by default.
- **Label** (500, 0.75rem): field labels, pills, table column heads (column heads also uppercase with
  `tracking-wide`).
- **Eyebrow** (600, 0.6875rem, 0.18em, UPPERCASE, Gold Ink): the small gold line above a headline ("Booking request",
  "Operations"). On navy it switches to Gold Bright.
- **Mono** (400, 0.75rem): booking references, claim and PO numbers, door codes, IPs. Never for prose.

### Named Rules

**The Serif Is a Heading Rule.** Newsreader appears on `h1`, `h2`, `h3`, the wordmark, KPI figures and the property
name. It never sets body copy, labels, buttons or table cells.

**The Tabular Figures Rule.** Tables, definition lists, times and anything with `.tabular-nums` use tabular figures so
money and dates align without opting in per cell.

## Layout

A single centred column, `max-width: 80rem` (1280 px), with 1rem side gutters on phones and 1.5rem from the `md`
breakpoint; main content has 2rem vertical padding. The sticky header is 4rem tall with a translucent blur, the one
place the UI borrows iOS material directly; on phones the nav becomes a horizontally scrolling strip beneath it.

Detail pages split at `lg` (1024 px) into a fluid main column and a 380 px sticky aside
(`grid-cols-[1fr_380px]`, gap 1.5rem, 2rem from `lg`), where the quote lives. Dashboards use a four-tile KPI row that
collapses to two then one. Below 1280 px the requests table becomes a card list rather than crushing its columns;
other tables scroll sideways inside their panel with a 40rem minimum width.

Spacing rhythm is a 4 px grid: 0.25rem micro gaps, 0.5rem between related controls, 1rem between groups, 1.25rem panel
padding, 1.5rem between panels, 2rem between page regions. Panels are stacked in a `space-y-6` column; a
`flush` panel divides its sections with hairlines and 1rem/1.25rem section padding instead of nesting cards.

Print is a first-class layout: A4, 16mm/14mm margins, chrome and controls hidden, panels kept whole, paper white
whatever the screen theme.

## Elevation & Depth

Flat by default. Panels are white on cream with a 1 px Cream 200 hairline and no shadow at rest; depth is conveyed by
the cream/white/sunken surface steps. Shadow appears only on things that genuinely lift off the page: the sticky
header's blur, popovers, buttons (an `xs` whisper on filled buttons), and the large shadow on a dialog. In the dark
theme, lift is a lighter surface plus a hairline, and shadows deepen only to keep the same reading.

### Shadow Vocabulary

- **xs** (`0 1px 2px rgb(22 36 59 / 0.05)`): filled buttons at rest.
- **sm** (`0 1px 3px rgb(22 36 59 / 0.07), 0 1px 2px rgb(22 36 59 / 0.04)`): a hovered card list item, a date popover.
- **md** (`0 4px 14px rgb(22 36 59 / 0.08)`): dropdown menus, the mobile search sheet.
- **lg** (`0 16px 40px rgb(22 36 59 / 0.12)`): dialogs.

Shadow colour is the brand navy at low alpha, never neutral black, so lifted surfaces stay warm against cream.

### Named Rules

**The Flat-By-Default Rule.** A panel never carries a shadow at rest. If a surface needs to feel lifted, it is because
it is above the page (header, popover, dialog), not because it is important.

## Shapes

Rounded, not pill-shaped: iOS sits between the web's 6 px and a capsule, and so does this system. Controls and fields
use 0.625rem (`md`); panels, cards and large buttons 0.875rem (`lg`); dialogs and the mobile sheet 1.125rem to
1.375rem. Pills (status, SLA band, roles) are the only full-radius shapes, and the KPI icon disc is a circle. Borders
are 1 px hairlines in Cream 200, never 2 px, never dashed. The gold rule under a hero eyebrow is a 3.5rem × 2px bar.
Images are clipped to the panel radius; the stay card thumbnail is 7rem × 5rem at `lg` radius.

## Components

Refined and restrained. Hover is a quiet tint, the press is a brief 97 % scale, focus is a 2 px gold ring offset from
the control. One ease for everything that moves: `cubic-bezier(0.32, 0.72, 0, 1)` at 150 ms.

### Buttons

- **Shape:** gently rounded (0.625rem); 2.75rem tall at the default size, 3rem large, 2.25rem small (dense table rows
  only), 2.75rem square for icon buttons. Text 0.875rem medium, never uppercase.
- **Primary (navy):** Harbour Navy fill, white text, `xs` shadow. The default action.
- **Gold:** Antique Gold fill, Navy Deep text (7.3:1). The one call to action per screen.
- **Outline:** white fill, Cream 300 border, navy text; hover tints to Cream 100. Secondary actions and cancel.
- **Secondary:** Cream 100 fill, navy text. Quiet actions inside panels.
- **Ghost:** transparent, Ink 700 text; hover tints to Cream 100. Toolbars and table rows.
- **Destructive:** Bad red fill, white text; always behind a two-press confirm (`ConfirmButton`).
- **Link:** Gold Ink text, underline on hover, no press scale.
- **Hover / Focus / Active:** hover changes background only; focus-visible draws a 2 px Antique Gold ring with a 2 px
  background-coloured offset; active scales to 0.97; disabled drops to 50 % opacity.

### Status pills

- **Style:** full-radius, 0.75rem medium text, 0.125rem × 0.625rem padding, 1 px border, always carrying the status
  label. The one shared mapping for booking states: navy outline (submitted), gold outline with Gold Ink text (under
  review, counter-offered), gold filled (approved, awaiting payment), green (confirmed, checked in, completed), muted
  (draft, expired), red (declined, failed, cancelled).
- **Plain pills** (no border) carry non-booking states: SLA band, account standing, person active.

### Panels

- **Corner Style:** 0.875rem.
- **Background:** white on the cream page; night-surface in dark.
- **Shadow Strategy:** none at rest (Flat-By-Default).
- **Border:** 1 px Cream 200 hairline.
- **Internal Padding:** 1.25rem; `flush` panels use hairline-divided sections at 1rem × 1.25rem.
- **Heading:** serif title, optional one-line muted description, actions on the trailing edge. A `GroupLabel`
  (sans, 0.875rem medium, navy) subdivides a panel without nesting cards.

### Inputs / Fields

- **Style:** white fill, 1 px Cream 300 border, 0.625rem radius, 2.75rem tall, 0.875rem text in Harbour Navy, 0.75rem
  side padding. Labels sit above at 0.75rem medium and wrap the control.
- **Hover:** border darkens toward Ink 500.
- **Focus:** border turns Antique Gold and a 3 px gold halo at 24 % alpha appears; no outline.
- **Error:** Bad border plus a 1 px Bad ring, message beneath in Bad at 0.75rem; the server lists the offending fields
  in a banner above the form.
- **Checkbox / radio:** native, accent-coloured Antique Gold. Date fields use the native picker with its glyph dimmed.

### Banners

- **Style:** 0.625rem radius, 1 px border, 0.75rem × 1rem padding, leading 1rem icon, 0.875rem text. Four tones: info
  (Cream 100), warn, error, success, each from its status triad. Errors announce as `role="alert"`.

### Navigation

- **Partner header:** sticky, Cream 100 at 85 % with backdrop blur, 4rem tall, wordmark left with a gold eyebrow
  descriptor ("Partner portal"), links as 0.875rem text with a 0.625rem hover tint; the active link is navy medium
  with a 2 px Antique Gold underline inset 0.75rem from each end.
- **Ops header:** identical geometry on fixed Harbour Navy at 85 %; links white at 75 % opacity, white when active,
  same gold underline. Sign-out is a 2.25rem outline button on both.
- **Mobile:** the same links as a horizontally scrolling strip under the header; no hamburger.

### Wordmark

"Live Luxe" set in Newsreader at 1.375rem, navy on cream and white on navy, with an optional eyebrow descriptor
beside it. This text wordmark is the logo; there is no graphic mark.

### KPI tile

A panel with a 0.875rem medium label, a 2rem circular icon disc (navy at 5 % or gold at 10 %), and a 2.25rem serif
figure beneath. Four across on desktop, one per row on phones.

## Do's and Don'ts

### Do:

- **Do** put one gold-filled action on a screen and make it the thing the visitor came for (The One Gold Action Rule).
- **Do** set gold text in Gold Ink (`#866206`) on light surfaces and Antique Gold on navy; never Antique Gold on cream.
- **Do** keep every control 2.75rem tall and every tap target 44 px, including table-row buttons on phones.
- **Do** label every status with words inside its pill; colour is reinforcement, never the message.
- **Do** use roles (`card`, `border`, `strong`, `accent`) rather than brand hexes so dark mode and print stay correct.
- **Do** show money as `AUD $1,837.00` with tabular figures, and timestamps in Melbourne time with the zone shown.
- **Do** keep the ops header navy and the partner header cream in both themes.
- **Do** make request detail pages print as a clean A4 document: no chrome, no controls, panels unbroken.

### Don't:

- **Don't** add shadows to panels at rest, or use neutral-black shadows; lift only header, popovers and dialogs with
  navy-tinted shadow.
- **Don't** set body copy, labels, buttons or table cells in the serif; Newsreader is for headings, the wordmark and
  hero figures.
- **Don't** use gradients, glass panels, hero imagery or marketing patterns inside the operational screens.
- **Don't** introduce a second accent; status colours are the only colours beyond navy, gold and cream.
- **Don't** exceed 0.875rem radius on panels or go below 0.5rem on controls; no square corners, no capsule buttons.
- **Don't** uppercase anything except eyebrows and table column heads.
- **Don't** reach for a card inside a card; subdivide a panel with hairline sections and a GroupLabel.
