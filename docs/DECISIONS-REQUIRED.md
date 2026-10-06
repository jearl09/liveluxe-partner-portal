# Decisions required from Livluxe before build (spec §23.2)

Track each decision here. A phase cannot start until its blocking decisions are recorded with an owner and date.

| #   | Decision                                                                                      | Blocks    | Status | Owner | Decided | Answer / ADR                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------- | --------- | ------ | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 10  | **Hostaway test account provisioning** (critical path)                                        | Phase 1   | ☐ Open |       |         |                                                                                                                              |
| 1   | GST treatment for stays of 28+ days, by property and partner type (accountant sign-off)       | Phase 3   | ☐ Open |       |         | placeholder: flat 10% in `settings.tax.rules`                                                                                |
| 2   | Rate card structure (percentage / fixed / tiers) and stacking order vs Hostaway LOS discounts | Phase 3   | ☐ Open |       |         | engine currently: LOS first, then rate card                                                                                  |
| 4   | Soft or hard holds, and hold duration                                                         | Phase 3   | ☐ Open |       |         | default: soft, 48 h                                                                                                          |
| 3   | Payment mode per partner (prepay / deposit / net terms) and credit limits                     | Phase 4   | ☐ Open |       |         |                                                                                                                              |
| 11  | Livluxe legal entity, ABN and invoice branding                                                | Phase 4   | ☐ Open |       |         | Live Luxe Pty Ltd, ABN 16 678 772 613, Unit 5, 11 Rocklea Drive, Port Melbourne VIC 3207 (from insurance schedule — confirm) |
| 7   | Hostaway direct-booking channel ID; custom field for platform reference                       | Phase 5   | ☐ Open |       |         |                                                                                                                              |
| 5   | Approval SLA per partner tier and Livluxe operating hours                                     | Phase 3/5 | ☐ Open |       |         | default: 4 h, tier-1 2 h, 08:00–18:00 AEST                                                                                   |
| 6   | Cancellation policy for long stays — cut-off and retention schedule                           | Phase 5   | ☐ Open |       |         | default cut-off 14 days                                                                                                      |
| 8   | Partner-visible listings and suitability tag vocabulary                                       | Phase 2   | ☐ Open |       |         | seed tags: insurance, corporate, family, pet_friendly, accessible                                                            |
| 9   | Check-in detail release timing (T-48h default or per-property)                                | Phase 5   | ☐ Open |       |         | default T-48h                                                                                                                |
| 12  | Pilot partner selection                                                                       | Phase 7   | ☐ Open |       |         |                                                                                                                              |

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
