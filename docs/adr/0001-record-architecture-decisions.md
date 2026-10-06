# ADR 0001 — Record architecture decisions

**Status:** Accepted · **Date:** 2026-10-06

## Context

The build specification (`docs/spec/Livluxe-Partner-Booking-Platform-Architecture-Spec.pdf`, v1.0) makes a number of
decisions on Livluxe's behalf and marks them as recommendations so they can be overridden deliberately rather than by accident.
We need a lightweight way to record when we follow, override or extend them.

## Decision

We record architecture decisions as numbered Markdown files in `docs/adr/`, one per decision, using this template:

```
# ADR NNNN — Title
**Status:** Proposed | Accepted | Superseded by NNNN · **Date:** YYYY-MM-DD
## Context
## Decision
## Consequences
## Spec reference  (section number(s) this follows or departs from)
```

Decisions already taken by this scaffold, inherited from the spec and recorded here for traceability:

| ADR | Decision                                                                                 | Spec            |
| --- | ---------------------------------------------------------------------------------------- | --------------- |
| —   | Single Next.js deployment; no separate backend, no queue, no microservices               | §3.4            |
| —   | Postgres-backed durable queue for webhooks (`webhook_events` + SKIP LOCKED drain)        | §3.4            |
| —   | Supabase in `ap-southeast-2`, Vercel functions pinned to `syd1`                          | §4              |
| —   | Soft holds by default; hard holds available per partner / value                          | §10.4           |
| —   | Capture at approval, not check-in; deposit or invoice modes for long-lead bookings       | §11.4           |
| —   | Stripe-hosted invoice PDFs; no custom invoice generator                                  | §4              |
| —   | MapLibre + swappable tile provider; native heatmap layer first                           | §14.3           |
| —   | Jittered `geom_public` for partner-facing maps until approval                            | §14.4           |
| —   | Permission matrix lives in `role_permissions` table + mirrored TS module, pinned by test | §2.3            |
| —   | Next.js 16 `proxy.ts` (not `middleware.ts`) for session refresh and redirects            | n/a (framework) |

## Consequences

Anyone departing from the spec writes an ADR first. Reviewers can ask "where is the ADR?" for any surprising change.
