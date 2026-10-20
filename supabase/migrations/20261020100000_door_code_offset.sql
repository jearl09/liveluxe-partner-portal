-- The door code is released later than the rest of the check-in pack (David, 20 Oct 2026):
-- Wi-Fi and directions at checkin.release_offset_hours (48), the door code at this many hours before check-in.
insert into settings (key, value, description) values
  ('checkin.door_code_offset_hours', '24', 'Show the door code this many hours before check-in (never earlier than the pack release)')
on conflict (key) do nothing;
