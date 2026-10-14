# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: insurance claims officers** at partner insurers. They are placing a displaced policyholder after a home
  claim (fire, flood, storm, burst pipe). Often same day, several open claims at once, working from a claims system
  with a claim reference they must attach to every cost. They are not travel buyers and do not browse; they need a
  suitable property, fast, that will pass audit.
- **Secondary (confirmed, lighter weight): corporate and government coordinators** housing relocating staff or
  project teams for weeks or months. Planned ahead, PO-number driven, longer stays, extensions common.
- **Partner administrators** (one or two per organisation) who invite colleagues, set roles and see all invoices.
- **Live Luxe operations** (livluxe_ops): answer requests inside the service window, release check-in packs, handle
  cancellations and changes. **Live Luxe finance** (livluxe_finance): refund overrides, disputes, reconciliation,
  dunning. **Live Luxe admin**: everything, plus partners, rate cards and settings.

## Product Purpose

An invite-only direct booking portal for Live Luxe Pty Ltd (ABN 16 678 772 613), a Melbourne short-stay operator
whose properties (Docklands and surrounds) are managed in Hostaway. Partners find an available property, request it
for a guest with their claim or PO reference, secure it with a card hold or invoice terms, and get a tax invoice and
check-in pack without any email back-and-forth. Live Luxe approves, counter-offers or declines from a queue with a
service-level clock, and the portal creates the Hostaway reservation, charges or invoices through Stripe, and keeps
money, inventory and audit in step.

Success for the pilot (3 weeks, go-live 24 Oct 2026): one real partner placing real guests end to end with no manual
reconciliation by Live Luxe and no double-bookings.

## Positioning

Today partners book by emailing or phoning the Live Luxe team, who check Hostaway and reply with options and a price,
then invoice by email. The portal replaces that loop with:

- live availability and a frozen quote the partner can act on immediately, priced from their own negotiated rate card;
- a request-and-approve flow (not instant booking) so Live Luxe keeps control of who stays where, while the partner
  gets a decision deadline and a held date;
- claim reference, PO number and cost centre captured at request time and printed on the Stripe tax invoice, so the
  booking is audit-ready for the insurer;
- payment either as a card pre-authorisation captured on approval or on invoice terms, with cancellation retention,
  refunds and credit notes handled automatically;
- a check-in pack (address, then door code and Wi-Fi) released on a schedule and logged per view.

Public booking sites cannot offer the partner rate card, the claim-reference audit trail, invoice terms or the
request-and-approve control. A generic PMS booking engine cannot offer the insurer-specific workflow.

## Operating Context

- Partners work in Australian business hours, mostly on desktop in a claims system, sometimes on a phone from a site
  visit. Urgency is high: a family may be in a motel tonight.
- Live Luxe ops work from the queue, Slack (#bookings, #alerts) and email; Hostaway remains their calendar of
  record and Stripe their ledger. The portal is the only place partners and Live Luxe meet.
- Money is AUD, integer cents, GST at 10 % on accommodation and cleaning. Dates are calendar dates in the property's
  timezone (Australia/Melbourne); timestamps are shown in Melbourne time.
- Stays are typically 5 to 30 nights; extensions are common ("the rebuild overran"); early departures happen.
- Service window (SLA) default 4 business hours; card holds default 48 hours; cancellation cut-off 14 days with a
  retention schedule Angel has not yet set. All tunables live in the `settings` table, never in code.
- The architecture of record is `docs/spec/Livluxe-Partner-Booking-Platform-Architecture-Spec.pdf` (v1.0); code
  cites it by section. Start any engineering work from `docs/HANDOFF.md`; cut-over steps in `docs/GO-LIVE-CHECKLIST.md`;
  open business decisions in `docs/DECISIONS-REQUIRED.md`.

## Capabilities and Constraints

Confirmed functionality (built, tested, deployed to the test site):

- Invite-only auth with roles (partner_admin, partner_booker, partner_viewer, livluxe_ops, livluxe_finance,
  livluxe_admin), optional TOTP MFA, rate-limited login.
- Search with live availability, map with jittered points before approval, listing pages, quotes with rate cards.
- Requests with guest, references and notes; duplicate-submission protection; credit-limit gate; finance routing.
- Ops queue with SLA bands and escalation, approve / counter-offer / decline, value ceiling.
- Stripe: card hold, capture on approval, deposit mode, invoices (receipt and net-terms), balance invoices, refunds,
  credit notes, disputes with refund freeze, dunning, nightly reconciliation with CSV export.
- Hostaway: listing and calendar sync, reservation create / update / cancel (production only), nightly reconciliation.
- Cancellations with policy retention and finance override; extensions and early departures.
- Check-in pack with exposure tiers (approximate → address → full pack), scheduled and manual release, encrypted
  codes, per-view access log.
- Email via Resend from booking.liveluxe.au; Slack notifications; audit log; 14 scheduled jobs.

Constraints:

- Writes to Hostaway only in production (or against a declared test account). A double-booking is the worst failure.
- Door codes and Wi-Fi are the most sensitive non-financial data: never in email, never in logs, encrypted at rest,
  every view logged.
- Secrets never in chat, docs or the repo; `.env.local` and Proton Pass only.
- Business tunables are settings, not code; no screen edits them yet (SQL editor).
- Not in pilot scope: consolidated monthly invoicing, saved cards, Stripe Tax, SMS, instant upstream-cancellation
  webhooks from Hostaway, a basket (multi-property request).

Undecided product facts (owner: Angel, Live Luxe): deposit percentage, whether invoice-terms bookings confirm on
approval or on payment, hold hours, cancellation retention tiers, Hostaway direct channel id and reference custom
field (see DECISIONS-REQUIRED.md).

## Brand Commitments

- Name: **Live Luxe** (trading name; legal entity Live Luxe Pty Ltd). The repo and spec use "Livluxe" in identifiers;
  user-facing copy says "Live Luxe".
- Existing in-app identity, derived from the public Docklands website: navy `#101c2c`, cream `#f4efe6`, gold
  `#b7853a`, Playfair Display headings, Inter body. Partner chrome cream, Live Luxe ops chrome navy.
- **A brand kit exists** (logo files and style guide) and will be supplied by the engineer. Not yet in the repo:
  `public/` holds only Next.js placeholders. When it lands, it supersedes the website-derived palette and fonts
  where they conflict, and the wordmark replaces the text brand in `components/layout/brand.tsx`.
- Voice: plain, calm, factual; Australian English; no exclamation marks. Partners are professionals under time
  pressure; Live Luxe is a premium operator, not a startup. Every partner-facing email carries the booking reference,
  one action and a human contact.

## Evidence on Hand

- Architecture spec PDF (`docs/spec/`), ABN extract and the business insurance schedule (`docs/spec/`).
- Real Hostaway listings and photos (synced; Hostaway CDN URLs), real quotes and test Stripe payments on the test site.
- A user guide (`docs/guides/Livluxe-Partner-Portal-User-Guide.pdf`) and the generator script.
- **No** partner testimonials, case studies, logos or usage numbers exist. Do not fabricate any. The first partner
  has not been named.
- Demo accounts and demo organisations exist for the test site only.

## Product Principles

1. **Control over convenience.** Request-and-approve, not instant booking: Live Luxe decides who stays, the partner
   gets certainty about when.
2. **Audit-ready by default.** Every booking carries the partner's references and lands on a tax invoice; every
   money and inventory event is mirrored from its source of truth and reconciled nightly.
3. **The claims officer is in a hurry.** Fewest fields, clearest status, one obvious next action; the dashboard
   answers "what needs me now" before anything else.
4. **Sensitive data is earned, not shown.** Addresses after approval, codes before arrival, nothing after checkout,
   all logged.
5. **Operators keep their tools.** Hostaway stays the calendar, Stripe the ledger, Slack the pager; the portal
   orchestrates and never silently diverges from them.

## Accessibility & Inclusion

Target WCAG 2.1 AA (spec). Partner users may be on a phone at a damaged property: layouts must work at phone width
with large touch targets, and the status of a request must be readable without colour alone (status pills carry text).
Automated axe checks run in the Playwright suite.
