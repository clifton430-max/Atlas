-- =============================================================================
-- Server-side cache for the place-details Edge Function (additive).
-- Holds normalized, PUBLIC OpenStreetMap / Wikimedia data per place so the
-- OSM API, Wikidata, Commons and Overpass aren't queried repeatedly.
-- RLS enabled with no policies: only the service role (Edge Function) reads
-- or writes; clients get data through the function.
-- =============================================================================
create table public.place_details (
  ref text primary key check (ref ~ '^osm:(node|way|relation)/[0-9]{1,15}$'),
  details jsonb not null,
  fetched_at timestamptz not null default now(),
  children jsonb,
  children_fetched_at timestamptz
);
alter table public.place_details enable row level security;
revoke all on public.place_details from anon, authenticated;
