-- Airport coordinates, cached for weather lookups (Open-Meteo needs
-- lat/lon; AeroAPI's /airports/{code} has them but airports don't move,
-- so this is cached indefinitely rather than refetched every flight
-- lookup). Same pattern as `flights`: shared, service-role-written only.

create table public.airports (
  code       text primary key,
  name       text,
  city       text,
  latitude   double precision,
  longitude  double precision,
  timezone   text,
  fetched_at timestamptz not null default now()
);

alter table public.airports enable row level security;

create policy "airports: readable by authenticated users"
  on public.airports for select
  to authenticated
  using (true);
