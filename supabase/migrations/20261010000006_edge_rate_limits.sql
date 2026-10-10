-- =============================================================================
-- Abuse control for public Edge Functions (additive; no existing objects change).
--
-- edge_consume_rate_limit(bucket, limit, window) implements an atomic
-- fixed-window counter. discover-events uses it for:
--   * per-client limits (bucket = 'ip:<salted sha256 of client IP>' — raw IPs
--     are never stored),
--   * a global Ticketmaster call budget (per second and per day).
-- Only the service role (Edge Functions) can read the table or call the function.
-- =============================================================================
create table public.edge_rate_limits (
  bucket text primary key check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  count integer not null
);
alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;

create or replace function public.edge_consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
begin
  insert into public.edge_rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    count = case when r.window_start <= v_cutoff then 1 else r.count + 1 end,
    window_start = case when r.window_start <= v_cutoff then v_now else r.window_start end
  returning count into v_count;

  -- Opportunistic pruning keeps the table small.
  if random() < 0.01 then
    delete from public.edge_rate_limits where window_start < v_now - interval '2 days';
  end if;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.edge_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.edge_consume_rate_limit(text, integer, integer) to service_role;
