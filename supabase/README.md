# Supabase — migrations & Edge Functions

Everything in here (`migrations/`, `functions/`) is written but **not pushed
to the live project yet** — I don't have your DB password, service-role
key, or a Supabase access token, so `db push` / `functions deploy` /
`secrets set` need to run from your machine, logged in as you.

## One-time setup

```bash
cd mobile

# 1. Auth the CLI (opens a browser).
supabase login

# 2. Link this folder to your project (ref is from your SUPABASE_URL:
#    https://meickigaouzqffxxlbyf.supabase.co).
supabase link --project-ref meickigaouzqffxxlbyf

# 3. Push the schema in migrations/0001_init.sql.
supabase db push

# 4. Push the Edge Function secrets (values are already filled in
#    supabase/.env — gitignored, never committed).
supabase secrets set --env-file supabase/.env

# 5. Deploy both functions.
supabase functions deploy assistant
supabase functions deploy flight-lookup
```

After that, `mobile/.env` (just `SUPABASE_URL` + `SUPABASE_ANON_KEY`) is all
the app itself needs — `npm run ios` / `npm run android` picks the rest up
automatically once `hasDatabase` is true (see `src/lib/config.ts`).

## What's here

| Path | What |
|---|---|
| `migrations/0001_init.sql` | `profiles` (1:1 with `auth.users`, auto-created on signup), `flights` (shared cache, service-role write only), `tracked_trips`, `alerts` — all RLS-scoped to `auth.uid()` except `flights`, which is read-only to any authenticated client. |
| `functions/assistant` | Calls the Anthropic API with `ANTHROPIC_API_KEY` (server-side secret). Client: `src/lib/providers/assistantProvider.ts`. |
| `functions/flight-lookup` | Calls FlightAware AeroAPI with `AEROAPI_KEY`, caches into `flights`, best-effort OpenSky token fetch (position lookup itself is a TODO — see the comment in that file). Not yet called from the client; see the TODO in `src/lib/providers/flightProvider.ts`. |

## Known gaps (next real steps)

- **No sign-in UI.** `src/lib/providers/db.ts` (profile/alerts/trips) needs
  an authenticated Supabase session — RLS has nothing to key off without
  one. `supabase-js` + `@react-native-async-storage/async-storage` are
  already wired up in `src/lib/supabase.ts`; what's missing is the actual
  sign-in screen/flow.
- **`flight-lookup` isn't called from the UI yet.** It returns a
  normalized schedule/status row, not the full `FlightDetail` shape (
  intelligence signals, weather, leave-by timeline, event feed) the app
  renders — composing that from real data is a decision-engine-sized
  effort on its own.
- **OpenSky position lookup is a stub.** The function fetches an OAuth2
  token but doesn't resolve tail number → ICAO24 (needs OpenSky's
  aircraft-database export, not a live endpoint) or call `/api/states/all`
  yet.
