-- =============================================================================
-- Provider failure backoff (additive: two nullable columns).
-- Without this, a failing provider (bad key, outage, 429) would be retried on
-- every Discover request. discover-events now records the failure and skips
-- the provider until retry_after:
--   * key '__global__': auth failures (5 min) and upstream 429s (60 s)
--   * per-viewport key: timeouts / 5xx (60 s)
-- Still service-role only (RLS enabled, no policies).
-- =============================================================================
alter table public.event_fetch_log add column if not exists last_error text;
alter table public.event_fetch_log add column if not exists retry_after timestamptz;
