-- Week 3: Stripe payments (§11), Hostaway write idempotency (§6.7), invoice listing.
-- Pure additive; safe to re-run.

alter table booking_requests add column if not exists hostaway_write_key text;

-- 'authorise' = PaymentIntent with manual capture (mode A, captured on approval);
-- 'charge'    = immediate capture, used when a booking is already approved and
--               awaiting payment after a lapsed or failed authorisation.
alter table payments add column if not exists mode text not null default 'authorise';
alter table payments add column if not exists failure_message text;
alter table payments add column if not exists canceled_at timestamptz;
alter table payments add column if not exists card_brand text;

create index if not exists payments_booking_idx on payments (booking_id, created_at desc);
create index if not exists invoices_org_idx on invoices (org_id, created_at desc);
create index if not exists invoices_booking_idx on invoices (booking_id);

-- Partners only read; every write goes through the service role from webhook and
-- job code (lib/payments, lib/stripe/webhooks). Existing select policies already
-- scope payments and invoices to the partner's organisation.
