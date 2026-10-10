-- Additive: remember how many events Ticketmaster reported for a viewport so
-- cached responses can still say "showing N of M" honestly.
alter table public.event_fetch_log add column if not exists total_available integer;
