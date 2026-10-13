# Decisions required from Livluxe before build (spec §23.2)

Track each decision here. A phase cannot start until its blocking decisions are recorded with an owner and date.

| #   | Decision                                                                                      | Blocks    | Status | Owner | Decided | Answer / ADR                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------- | --------- | ------ | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **Hostaway test account provisioning** (critical path)                                        | Phase 1   | ☐ Open |       |         |                                                                                                                                                 |
| 1   | GST treatment for stays of 28+ days, by property and partner type (accountant sign-off)       | Phase 3   | ☐ Open |       |         | placeholder: flat 10% in `settings.tax.rules`                                                                                                   |
| 2   | Rate card structure (percentage / fixed / tiers) and stacking order vs Hostaway LOS discounts | Phase 3   | ☐ Open |       |         | engine currently: LOS first, then rate card                                                                                                     |
| 4   | Soft or hard holds, and hold duration                                                         | Phase 3   | ☐ Open |       |         | default: soft, 48 h                                                                                                                             |
| 3   | Payment mode per partner (prepay / deposit / net terms) and credit limits                     | Phase 4   | ☐ Open |       |         |                                                                                                                                                 |
| 11  | Livluxe legal entity, ABN and invoice branding                                                | Phase 4   | ☐ Open |       |         | Live Luxe Pty Ltd, ABN 16 678 772 613, Unit 5, 11 Rocklea Drive, Port Melbourne VIC 3207 (from insurance schedule — confirm)                    |
| 7   | Hostaway direct-booking channel ID; custom field for platform reference                       | Phase 5   | ☐ Open |       |         | read from `settings.hostaway.direct_channel_id` / `hostaway.reference_custom_field_id` (set once Hostaway confirms); falls back to channel 2000 |
| 5   | Approval SLA per partner tier and Livluxe operating hours                                     | Phase 3/5 | ☐ Open |       |         | default: 4 h, tier-1 2 h, 08:00–18:00 AEST                                                                                                      |
| 6   | Cancellation policy for long stays — cut-off and retention schedule                           | Phase 5   | ☐ Open |       |         | default cut-off 14 days                                                                                                                         |
| 8   | Partner-visible listings and suitability tag vocabulary                                       | Phase 2   | ☐ Open |       |         | seed tags: insurance, corporate, family, pet_friendly, accessible                                                                               |
| 9   | Check-in detail release timing (T-48h default or per-property)                                | Phase 5   | ☐ Open |       |         | default T-48h                                                                                                                                   |
| 12  | Pilot partner selection                                                                       | Phase 7   | ☐ Open |       |         |                                                                                                                                                 |

## Verify-before-building checklist (spec cover page, §6)

- [ ] Every Hostaway endpoint and field name in `lib/hostaway/types.ts` re-verified against https://api.hostaway.com/documentation
- [ ] Real recorded responses captured from the test account into `tests/fixtures/hostaway/` (replace placeholders)
- [ ] Webhook payload shape confirmed and `HostawayWebhookBody` updated
- [ ] Rate-limit numbers confirmed (15/10 s per IP, 20/10 s per account) and bucket budget tuned
- [ ] Multi-unit listings present? Allotment rule is implemented regardless

## Business context (from the documents in `docs/spec/`)

- **Entity:** Live Luxe Pty Ltd, ABN 16 678 772 613, registered Warehouse 5, 11–15 Rocklea Drive, Port Melbourne VIC 3207.
- **Business:** Real estate management service / short-term stay accommodation management; annual turnover ~$1.1M; 2 FTE.
- **Insurance:** AIG Steadfast My Business Pack, policy 9984431CMB, public & products liability $20M, period 04/09/2026–04/09/2027.
  Relevant to the platform: partners' security questionnaires routinely ask for a certificate of currency — store it under
  `partner_documents` for the internal org and surface it from the admin console.

## Build notes on decision #3 — payment modes (13 Oct 2026)

What is built (Stripe sandbox, no real money):

- **Mode A (prepay, default)**: card hold at request time, captured on approval, voided on decline/expiry. Ops cannot approve until the hold is in place.
- **Mode C (net14 / net30)**: no card. Approval checks the org's credit limit against open invoices, then a Stripe invoice is emailed and the booking is **confirmed immediately** (confirm-now, pay-later). Please confirm this reading of credit terms; the alternative is to keep the booking in "Awaiting payment" until the invoice is paid.
- **Mode B (deposit)**: built 13 Oct (session 8). The card is held at request; on approval only the deposit is captured
  (`partner_orgs.deposit_pct`, else settings `deposit.default_pct` = 20) and Stripe releases the rest; a deposit receipt
  and a balance invoice are issued, the balance due `deposit.balance_due_days_before_checkin` (14) days before check-in
  (never in the past). Please confirm the 20 % default and the 14 days.
- **Credit limit at submission** (§17.2): settings `credit.over_limit_action` is `block` (partner told to contact the
  finance contact on the partner's page) — change to `finance_approval` to route over-limit requests to finance instead.
- **Dunning**: reminders on days 1 / 7 / 14 past due to the billing contact (org admins copied from the second reminder);
  new bookings need finance approval after 14 days; suspended for new bookings after 30 days (existing bookings untouched).
  All four are settings (`dunning.*`). Please confirm.

Per-partner terms and credit limit are set by Live Luxe admins on the partner's page.

## Build notes on decision #6 — cancellation policy (13 Oct 2026)

Built and live in the sandbox: partners can withdraw a pending request at any time, and cancel a confirmed booking
themselves while it is **at or before the cut-off** (`cancellation.cutoff_days`, currently 14). Inside the cut-off
they can only _request_ a cancellation and Live Luxe decides. The refund comes from the retention schedule
(`cancellation.retention_schedule`), which is currently empty, meaning: **full refund at/before the cut-off, no refund
after it**. Please give the schedule as tiers, for example:

| Cancelled at least … days before check-in | Live Luxe retains |
| ----------------------------------------- | ----------------- |
| 14                                        | 0%                |
| 7                                         | 50%               |
| 0                                         | 100%              |

Finance/admin can override the refund amount on any cancellation. Early departure (partial refund for a shortened
stay) is not built yet and needs the same schedule.

## Build notes on Phase 5 write-back (13 Oct 2026, session 8)

- Spec §5.1 says Hostaway writes only in production, while the Phase 5 exit criterion requires verification against the
  test account. Resolved with an explicit switch: `HOSTAWAY_WRITE_TARGET=test` plus `HOSTAWAY_TEST_ACCOUNT_ID` equal to
  the configured account id. Production keeps the §5.1 guard unchanged.
- Order of operations at confirmation follows §10.2 (reservation, then capture). The Week 3 code captured first; see
  HANDOFF session 8 for the consequences each way.
- **Decision for Angel (new): SLA 100 % SMS** (§10.5) — no SMS provider is configured; Slack + email carry the 100 % rung.
- **Decision for Angel (new): early-departure retention** — unused nights are refunded less the cancellation-policy
  retention for the notice given (same `cancellation.retention_schedule`). Confirm, or give a separate schedule.
