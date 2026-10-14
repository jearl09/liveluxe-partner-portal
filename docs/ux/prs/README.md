# Pull requests for the redesign (brief §12.5)

Stacked: each branch builds on the one before, so open them in order and set each PR's base to the previous branch.
When the first is merged, GitHub retargets the next to `main` by itself.

| # | Branch | Base | Title |
| --- | --- | --- | --- |
| 00 | `ux/00-groundwork-docs` | `main` | [Docs: go-live checklist, user guide, PRODUCT.md and DESIGN.md](00-groundwork-docs.md) |
| 01 | `ux/01-audit-and-design-system` | `ux/00-groundwork-docs` | [UX Phase 0–1: audit and the design system](01-audit-and-design-system.md) |
| 02 | `ux/02-shells` | `ux/01-audit-and-design-system` | [UX Phase 2 · Shells: headers, navigation, account menu](02-shells.md) |
| 03 | `ux/03-request-detail` | `ux/02-shells` | [UX Phase 2 · Request detail (both sides)](03-request-detail.md) |
| 04 | `ux/04-ops-queue-bookings` | `ux/03-request-detail` | [UX Phase 2 · Ops Queue and Bookings](04-ops-queue-bookings.md) |
| 05 | `ux/05-partner-screens` | `ux/04-ops-queue-bookings` | [UX Phase 2 · Partner screens: Dashboard, Search, Property, New request, Requests, Invoices, Team, Settings](05-partner-screens.md) |
| 06 | `ux/06-ops-partners-rate-cards` | `ux/05-partner-screens` | [UX Phase 2 · Ops Partners, Rate cards and Settings](06-ops-partners-rate-cards.md) |
| 07 | `ux/07-auth` | `ux/06-ops-partners-rate-cards` | [UX Phase 2 · Sign in, invitation and password reset](07-auth.md) |
| 08 | `ux/08-verification-and-handover` | `ux/07-auth` | [UX Phase 3–4: verification, fixes found, and the handover guide](08-verification-and-handover.md) |

To open one: push the branch, open a PR with the base above, and paste the file's contents (minus the first
line) as the description, using the first line as the title.
