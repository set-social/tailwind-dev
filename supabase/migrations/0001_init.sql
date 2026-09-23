-- FlightIQ data model — PostgreSQL on Supabase.
--
-- Scope: just what the app's providers already declare they need
-- (see src/lib/providers/db.ts) — per-user profile, tracked trips, and
-- alert history — plus a shared `flights` cache that the flight-lookup
-- Edge Function reads/writes so we don't re-hit AeroAPI on every request.
--
-- Design rules:
--  * user_id always references auth.users(id); RLS scopes every row to
--    auth.uid(), so a signed-in user only ever sees their own data.
--  * `flights` is shared, provider-sourced cache data — readable by any
--    authenticated client, writable only by the service role (i.e. only
--    from Edge Functions, never directly from the app).
--  * All instants are timestamptz (UTC).

create extension if not exists pgcrypto with schema extensions;

-- ─── profiles ───────────────────────────────────────────────────────────
-- One row per user, auto-created on signup. Mirrors src/lib/types.ts
-- `Profile`; `notification_prefs` is jsonb so new toggles don't need a
-- migration (mirrors the `extra` jsonb pattern from the flightwise schema).

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  name                    text not null default '',
  home_airport            text,
  arrival_buffer_minutes  integer not null default 20,
  tsa_precheck            boolean not null default false,
  clear                   boolean not null default false,
  checked_bags            integer not null default 0,
  transport               text not null default 'drive'
                             check (transport in ('drive', 'rideshare', 'transit')),
  notification_prefs      jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new Supabase Auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── flights (shared cache) ─────────────────────────────────────────────
-- One row per real-world flight + service date, deduped across users.
-- flight_key mirrors flightwise's convention: "UA1482:2026-09-22".
-- Populated only by the flight-lookup Edge Function (service role).

create table public.flights (
  flight_key           text primary key,
  airline_code         text not null,
  airline_name         text,
  flight_number        text not null,
  origin               text not null,
  destination          text not null,
  scheduled_departure  timestamptz not null,
  estimated_departure  timestamptz,
  actual_departure     timestamptz,
  scheduled_arrival    timestamptz not null,
  estimated_arrival    timestamptz,
  actual_arrival       timestamptz,
  status               text not null default 'scheduled'
                          check (status in ('scheduled', 'delayed', 'boarding', 'departed', 'landed', 'cancelled', 'diverted')),
  gate                 text,
  terminal             text,
  aircraft_type        text,
  tail_number          text,
  source               text not null default 'mock',
  raw                  jsonb,
  fetched_at           timestamptz not null default now()
);

alter table public.flights enable row level security;

-- Read-only from the client; no insert/update/delete policy for
-- anon/authenticated, so only the service role (Edge Functions) can write.
create policy "flights: readable by authenticated users"
  on public.flights for select
  to authenticated
  using (true);

create index flights_scheduled_departure_idx on public.flights (scheduled_departure);

-- ─── tracked_trips ──────────────────────────────────────────────────────

create table public.tracked_trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  flight_key  text not null references public.flights (flight_key),
  title       text,
  created_at  timestamptz not null default now(),
  unique (user_id, flight_key)
);

alter table public.tracked_trips enable row level security;

create policy "tracked_trips: owner full access"
  on public.tracked_trips for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index tracked_trips_user_id_idx on public.tracked_trips (user_id);

-- ─── alerts ─────────────────────────────────────────────────────────────
-- Mirrors src/lib/types.ts `Alert`.

create table public.alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  trip_id      uuid references public.tracked_trips (id) on delete cascade,
  kind         text not null check (kind in ('delay', 'leave', 'gate', 'connection', 'weather', 'good')),
  level        text not null check (level in ('good', 'watch', 'risk', 'neutral')),
  title        text not null,
  body         text not null,
  trip_label   text,
  action_label text,
  action_href  text,
  unread       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.alerts enable row level security;

create policy "alerts: owner full access"
  on public.alerts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index alerts_user_id_created_at_idx on public.alerts (user_id, created_at desc);
