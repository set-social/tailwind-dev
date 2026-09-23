-- Weather intelligence: caches for the free weather upstreams, and a cache of
-- the AI-written weather narrative per flight.
--
--  * airports.icao — the 4-letter code aviationweather.gov keys METAR/TAF on
--    (AeroAPI returns it alongside the IATA code we already store).
--  * weather_cache — one row per upstream lookup ("om:EWR" forecast series,
--    "metar:KEWR", "taf:KEWR", "nws:EWR" alerts), with a fetched_at the
--    functions check against a per-source TTL. The upstreams are free but
--    rate limited and shared by every user looking at the same airport, so
--    this keeps N users on one airport at one upstream call per TTL.
--  * weather_insights — the narrative (headline / insights / recommendations)
--    for a flight, keyed by a hash of the deterministic facts it was written
--    from. If the facts haven't changed, the same text is reused instead of
--    paying for another model call.
--
-- Access design: both new tables are service-role only. RLS is on with no
-- policies and every grant to anon/authenticated is revoked, so the app can
-- neither read nor poison them; only Edge Functions touch them. New tables
-- are not auto-exposed to the Data API roles (see supabase/config.toml), so
-- the service_role grants are explicit.

alter table public.airports add column if not exists icao text;

create table public.weather_cache (
  cache_key   text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.weather_cache enable row level security;
revoke all on public.weather_cache from anon, authenticated;
grant select, insert, update, delete on public.weather_cache to service_role;

create table public.weather_insights (
  flight_key  text primary key,
  input_hash  text not null,
  -- null when the model was skipped or failed; the deterministic findings are
  -- still served without it.
  narrative   jsonb,
  created_at  timestamptz not null default now()
);

alter table public.weather_insights enable row level security;
revoke all on public.weather_insights from anon, authenticated;
grant select, insert, update, delete on public.weather_insights to service_role;
