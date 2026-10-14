-- Check-in pack (spec §8.4, §10.6, §21.2 release-checkin).
--
-- 1. listing_access_details: a content hash so the hourly listing sync rewrites a
--    row only when Hostaway changed something (encryption uses a fresh IV, so the
--    ciphertext alone cannot tell us).
-- 2. booking_requests: who released the pack early, for the audit trail.
-- 3. checkin_access_log: index for "who looked at this booking's codes".

alter table listing_access_details
  add column if not exists content_hash text;

alter table booking_requests
  add column if not exists checkin_released_by uuid references partner_users(id);

create index if not exists checkin_access_log_booking on checkin_access_log (booking_id, viewed_at desc);

-- Only the service role writes the access log; partners never read it (RLS already livluxe-only).
revoke insert, update, delete on checkin_access_log from authenticated, anon;
revoke insert, update, delete on listing_access_details from authenticated, anon;
