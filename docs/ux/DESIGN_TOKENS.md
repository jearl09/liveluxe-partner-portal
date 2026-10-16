# Design tokens — measured contrast

Generated 2026-10-16 by `scripts/design-tokens-contrast.mjs` from `app/globals.css`. Do not edit by hand.

Floors: text ≥ 4.5:1 (primary text ≥ 7:1 by the brief), UI boundaries ≥ 3:1 (WCAG 2.2 AA, brief §10.2).

## Roles

| Role | Light | Dark |
| --- | --- | --- |
| `bg-canvas` | `#f4efe6` | `#0b1422` |
| `bg-surface` | `#fcfaf6` | `#16233a` |
| `bg-surface-raised` | `#ffffff` | `#1d2d47` |
| `bg-inset` | `#efe9dd` | `#101a2c` |
| `bg-field` | `#ffffff` | `#0c1626` |
| `border-subtle` | `#e9e1d2` | `#26354e` |
| `border-strong` | `#8f8a7d` | `#6c7f9e` |
| `text-primary` | `#16243b` | `#f0ece3` |
| `text-secondary` | `#3a4454` | `#c6cbd4` |
| `text-muted` | `#5a6373` | `#9aa5b6` |
| `accent-gold` | `#d3ac60` | `#d3ac60` |
| `accent-gold-hover` | `#c0994d` | `#e3bc70` |
| `text-on-gold` | `#16243b` | `#0d1a31` |
| `text-gold` | `#866206` | `#e3bc70` |
| `focus-ring` | `#866206` | `#d3ac60` |
| `surface-navy` | `#16243b` | `#16243b` |
| `text-on-navy` | `#f0ece3` | `#f0ece3` |
| `text-on-navy-muted` | `#c6cbd4` | `#c6cbd4` |
| `status-info-bg` | `#eef2f8` | `#1b2a45` |
| `status-info-fg` | `#2b3f63` | `#b9c7e2` |
| `status-info-border` | `#c5cfe0` | `#2f4468` |
| `status-attention-bg` | `#fffbeb` | `#33270c` |
| `status-attention-fg` | `#92400e` | `#fbbf24` |
| `status-attention-border` | `#fcd34d` | `#5c4414` |
| `status-success-bg` | `#ecfdf5` | `#0f2f28` |
| `status-success-fg` | `#047857` | `#6ee7b7` |
| `status-success-border` | `#a7f3d0` | `#1f5247` |
| `status-danger-bg` | `#fef2f2` | `#38181a` |
| `status-danger-fg` | `#b42318` | `#fca5a5` |
| `status-danger-border` | `#fecaca` | `#5e2a2c` |
| `status-muted-bg` | `#e9e1d2` | `#1d2d47` |
| `status-muted-fg` | `#5a6373` | `#a6afbd` |
| `status-muted-border` | `#d9cdb7` | `#35486a` |

## Measured pairs

| Foreground | Background | Use | Floor | Light | Dark |
| --- | --- | --- | --- | --- | --- |
| `text-primary` | `bg-surface` | body headings on cards | 7:1 | 14.93 ✓ | 13.34 ✓ |
| `text-primary` | `bg-canvas` | headings on the page | 7:1 | 13.59 ✓ | 15.66 ✓ |
| `text-primary` | `bg-inset` | text in wells | 7:1 | 12.87 ✓ | 14.77 ✓ |
| `text-primary` | `bg-field` | text in fields | 7:1 | 15.56 ✓ | 15.38 ✓ |
| `text-secondary` | `bg-surface` | running text on cards | 4.5:1 | 9.44 ✓ | 9.65 ✓ |
| `text-secondary` | `bg-canvas` | running text on the page | 4.5:1 | 8.59 ✓ | 11.34 ✓ |
| `text-secondary` | `bg-inset` | running text in wells | 4.5:1 | 8.14 ✓ | 10.69 ✓ |
| `text-muted` | `bg-surface` | captions, timestamps | 4.5:1 | 5.81 ✓ | 6.31 ✓ |
| `text-muted` | `bg-canvas` | captions on the page | 4.5:1 | 5.29 ✓ | 7.41 ✓ |
| `text-muted` | `bg-inset` | captions in wells | 4.5:1 | 5.01 ✓ | 6.99 ✓ |
| `text-muted` | `bg-field` | placeholders and hints in fields | 4.5:1 | 6.06 ✓ | 7.28 ✓ |
| `text-on-gold` | `accent-gold` | primary button label | 4.5:1 | 7.29 ✓ | 8.14 ✓ |
| `text-on-gold` | `accent-gold-hover` | primary button label, hover | 4.5:1 | 5.86 ✓ | 9.67 ✓ |
| `text-gold` | `bg-surface` | eyebrow, active nav | 4.5:1 | 5.35 ✓ | 8.76 ✓ |
| `text-gold` | `bg-canvas` | eyebrow on the page | 4.5:1 | 4.87 ✓ | 10.28 ✓ |
| `text-on-navy` | `surface-navy` | ops header text | 4.5:1 | 13.20 ✓ | 13.20 ✓ |
| `text-on-navy-muted` | `surface-navy` | ops header secondary | 4.5:1 | 9.55 ✓ | 9.55 ✓ |
| `accent-gold` | `surface-navy` | ops header underline / eyebrow (UI) | 3:1 | 7.29 ✓ | 7.29 ✓ |
| `border-strong` | `bg-surface` | outline-button and calendar-cell edge (UI) | 3:1 | 3.30 ✓ | 3.87 ✓ |
| `border-field` | `bg-surface` | input edge on a card (UI) | 3:1 | 4.27 ✓ | 4.26 ✓ |
| `border-field` | `bg-field` | input edge against its own fill (UI) | 3:1 | 4.45 ✓ | 4.91 ✓ |
| `border-field` | `bg-canvas` | input edge on the page (UI) | 3:1 | 3.89 ✓ | 5.00 ✓ |
| `focus-ring` | `bg-canvas` | focus ring on the page (UI) | 3:1 | 4.87 ✓ | 8.65 ✓ |
| `focus-ring` | `bg-surface` | focus ring on a card (UI) | 3:1 | 5.35 ✓ | 7.37 ✓ |
| `status-info-fg` | `status-info-bg` | info pill text on its tint | 4.5:1 | 9.37 ✓ | 8.42 ✓ |
| `status-info-fg` | `bg-surface` | info text on a card | 4.5:1 | 10.10 ✓ | 9.23 ✓ |
| `status-attention-fg` | `status-attention-bg` | attention pill text on its tint | 4.5:1 | 6.84 ✓ | 8.76 ✓ |
| `status-attention-fg` | `bg-surface` | attention text on a card | 4.5:1 | 6.80 ✓ | 9.42 ✓ |
| `status-success-fg` | `status-success-bg` | success pill text on its tint | 4.5:1 | 5.21 ✓ | 9.45 ✓ |
| `status-success-fg` | `bg-surface` | success text on a card | 4.5:1 | 5.26 ✓ | 10.32 ✓ |
| `status-danger-fg` | `status-danger-bg` | danger pill text on its tint | 4.5:1 | 6.01 ✓ | 8.42 ✓ |
| `status-danger-fg` | `bg-surface` | danger text on a card | 4.5:1 | 6.31 ✓ | 8.28 ✓ |
| `status-muted-fg` | `status-muted-bg` | muted pill text on its tint | 4.5:1 | 4.66 ✓ | 6.25 ✓ |
| `status-muted-fg` | `bg-surface` | muted text on a card | 4.5:1 | 5.81 ✓ | 7.10 ✓ |

Pairs below their floor: **0**.

## Notes

- Status `-border` values are tints inside the pill's own background and are not UI boundaries (DECISIONS.md #10).
- `text-on-gold` is navy in both themes; white on Antique Gold measures 2.1:1 and is never used.
- Light `focus-ring` is Gold Ink because Antique Gold on cream measures 2.0:1 (DECISIONS.md #6).
- The Antique Gold active-nav underline measures 2.0:1 on cream; it reinforces an active state already carried by `text-gold` text and `aria-current`, so it is not a boundary (DECISIONS.md #13).
