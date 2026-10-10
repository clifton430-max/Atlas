-- =============================================================================
-- Provider fetch log used by the discover-events Edge Function as a cache to
-- respect Ticketmaster rate limits (5 req/s, 5000/day on the default tier).
-- A viewport (rounded bbox + filters) fetched within the TTL is served from
-- public.events instead of calling the provider again.
--
-- RLS is enabled with NO policies: only the service role (Edge Function) can
-- read or write it.
-- =============================================================================
create table public.event_fetch_log (
  cache_key text primary key,
  provider text not null,
  fetched_at timestamptz not null default now(),
  result_count integer not null default 0
);
alter table public.event_fetch_log enable row level security;
revoke all on public.event_fetch_log from anon, authenticated;
