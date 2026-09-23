# Supabase — migrations & Edge Functions

Everything in here (`migrations/`, `functions/`) is written but **not pushed
to the live project unless you push it** — `db push` / `functions deploy` /
`secrets set` need to run from your machine, logged in as you.

## One-time setup

```bash
cd mobile

# 1. Auth the CLI (opens a browser).
supabase login

# 2. Link this folder to your project (ref is from your SUPABASE_URL:
#    https://meickigaouzqffxxlbyf.supabase.co).
supabase link --project-ref meickigaouzqffxxlbyf

# 3. Push the schema (migrations/0001 … 0005).
supabase db push

# 4. Push the Edge Function secrets (values are in supabase/.env —
#    gitignored, never committed). See supabase/.env.example.
supabase secrets set --env-file supabase/.env

# 5. Deploy the functions.
supabase functions deploy assistant
supabase functions deploy flight-lookup
supabase functions deploy drive-time
supabase functions deploy weather-insights
```

After that, `mobile/.env` (just `SUPABASE_URL` + `SUPABASE_ANON_KEY`) is all
the app itself needs — `npm run ios` / `npm run android` picks the rest up
automatically once `hasDatabase` is true (see `src/lib/config.ts`).

**Any change under `functions/_shared/` affects every function that imports
it — redeploy all four** (`assistant`, `flight-lookup`, `drive-time`, `weather-insights`), not
just the one you were editing.

## What's here

| Path | What |
|---|---|
| `migrations/0001_init.sql` | `profiles` (1:1 with `auth.users`, auto-created on signup), `flights` (shared cache, service-role write only), `tracked_trips`, `alerts` — all RLS-scoped to `auth.uid()` except `flights`, which is read-only to any authenticated client. |
| `migrations/0002_airports.sql` | `airports` — coordinates cache for weather/drive-time. |
| `migrations/0003_temp_unit.sql` | `profiles.temp_unit`. |
| `migrations/0004_assistant_hardening.sql` | `assistant_usage` + `consume_assistant_call()` (atomic per-user and global daily quota) and `ai_calls` (one row per model call). **Service-role only**: RLS on, no policies, all grants to `anon`/`authenticated` revoked, explicit grants to `service_role`. |
| `migrations/0005_weather_intelligence.sql` | `airports.icao`; `weather_cache` (per-airport upstream cache with a TTL the functions check) and `weather_insights` (the AI weather narrative per flight, keyed by a hash of the facts it was written from). Both **service-role only**, same access design as 0004. |
| `functions/weather-insights` | Weather & recommendations for a flight (see "Weather intelligence" below). Request `{ flightKey }` only. |
| `functions/assistant` | "Ask FlightIQ". Client sends `{ question, flightKey }` **only**; the function authenticates the caller, spends quota, loads the flight itself (same path as `flight-lookup`), and asks `claude-sonnet-5` with native structured output. Request handling is in `assistant/handler.ts` (unit-tested); `index.ts` just wires dependencies. |
| `functions/flight-lookup` | AeroAPI schedule/status + weather, inbound aircraft, live position; caches into `flights`. Thin HTTP wrapper over `_shared/flight-context.ts`. |
| `functions/drive-time` | Google Routes traffic-aware drive time to a departure airport. |
| `functions/_shared/` | `aeroapi.ts` (fetchers, `mapStatus`), `airports.ts`, `weather.ts`, `flight-context.ts` (cache-first `lookupFlight`, `parseFlightKey`), `http.ts` (`fetchWithTimeout`), `config.ts` (**model IDs and limits live here**), `auth.ts`, `rate-limit.ts`, `ai-log.ts`, `assistant-core.ts` (context builder, output schema, system prompt), `types.ts` (server mirror of `src/lib/types.ts`), `cors.ts`. |
| `functions/_shared/wx-*.ts` | The weather stack: `wx-parse.ts` (Open-Meteo, METAR, TAF and NWS parsers), `wx-assess.ts` (the deterministic rules), `wx-sources.ts` (fetch + shared cache), `wx-context.ts` (assembles departure / arrival / inbound), `wx-narrative.ts` (AI layer and its number-grounding guard). |
| `functions/_evals/fixtures.ts` | Fixture flights (on time, inbound late, cancelled, schedule-only) used by the tests now and by model-run evals once the tool-using agent lands. |
| `functions/deno.json` | Isolates the Edge Functions from the app's React Native `tsconfig.json`. |

## Secrets

| Secret | Used by | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `assistant` | Without it the function returns 501. |
| `AEROAPI_KEY` | `flight-lookup`, `assistant`, `drive-time` | Metered per call — everything goes through the `flights`/`airports` caches. |
| `GOOGLE_ROUTES_API_KEY` | `drive-time` | |
| `NWS_USER_AGENT` | `weather-insights`, `assistant` | Optional. api.weather.gov asks clients to identify themselves; defaults to "FlightIQ flight-intelligence app". |
| `ASSISTANT_DAILY_LIMIT` | `assistant` | Optional. Questions per user per UTC day. Default 25. |
| `ASSISTANT_GLOBAL_DAILY_LIMIT` | `assistant` | Optional. Questions across all users per UTC day. Default 2000. |

Nothing above ships in the app bundle. The app only ever holds the Supabase URL and anon key.

## Ask FlightIQ: what protects it

- **No client-supplied context.** The app sends a flight key; the flight is loaded server-side. There is nothing to spoof or prompt-inject from the app.
- **Real users only, per-person limits.** The caller's JWT must belong to a real (email or guest) user; each gets `ASSISTANT_DAILY_LIMIT` questions a day. Guests are cheap to create, so a global cap (`ASSISTANT_GLOBAL_DAILY_LIMIT`) bounds the worst case. The quota backend failing closes the endpoint (503) rather than leaving it unmetered.
- **Schema-guaranteed output.** Native structured output (`output_config.format`), validated again server-side; anything unusable is a 502, never a made-up answer.
- **Evidence is filtered, not trusted.** `basedOn` is intersected with the signals that were actually in the model's context.
- **No invented probabilities.** The system prompt forbids stating any; the app has no forecast model yet (Phase 3 of `docs/FLIGHTIQ_AI_ROADMAP.md`).
- **Prompt caching** is enabled on the system prompt (a stable prefix). It only starts to pay off once the prompt plus tool definitions pass the model's minimum cacheable length (1,024 tokens for `claude-sonnet-5`); check `cache_read_tokens` in `ai_calls` after deploying.

## Weather intelligence

Weather for both airports (and the aircraft's earlier leg), turned into
specific findings and plain-language recommendations. **Code decides, Claude
narrates.**

**Sources** (all keyless, all cached in `weather_cache`): Open-Meteo hourly
forecast (8 days: wind, gusts, direction, visibility, precipitation, pressure),
aviationweather.gov METAR and TAF (current observation and the airport's own
forecast, including TEMPO groups), and National Weather Service alerts
(US). METAR/TAF are keyed on the airport's ICAO code (stored in `airports.icao`,
or `K` + IATA for older rows in the lower 48); elsewhere the hourly forecast
covers it.

**Findings** (`_shared/wx-assess.ts`), computed for the departure airport around
the departure time, the arrival airport around the arrival time, and the
inbound aircraft's origin around *its* departure. Every number and time in a
finding comes from this code, in the airport's own timezone:

| Topic | Watch | Risk |
|---|---|---|
| Wind | gust >= 25 kt or sustained >= 20 kt | gust >= 35 kt or sustained >= 28 kt |
| Visibility / ceiling | IFR (< 3 mi or < 1,000 ft), or a TEMPO group dropping to IFR | LIFR (< 1 mi or < 500 ft) |
| Precipitation | >= 2.5 mm/h, snow or freezing | >= 7.6 mm/h, or thunderstorms |
| De-icing note | <= 2 C with precipitation | |
| NWS alert | Moderate | Severe / Extreme |
| Pattern | persistent onshore northeast flow (10-100 deg, gusts >= 20 kt) for 12 h+ on the mid-Atlantic to New England coast, peak gust >= 25 kt. Called "nor'easter-type" only at a 30 kt peak, and always labelled as a pattern read from the forecast, not an NWS declaration. | |

Plus a daily outlook (peak gust per local day), a 3-hourly wind chart around the
flight, and whether wind is building or easing after it.

**Narrative** (`_shared/wx-narrative.ts`, `claude-sonnet-5`, native structured
output): a headline, 2-4 insights and 1-4 recommendations, each recommendation
tied to a specific finding. It is checked after generation: any number that
isn't in the data it was given, or any talk of probability, chance or odds, gets
the draft rejected and retried once with the reasons; if it still fails there is
no narrative and the app shows the findings and a plain summary line instead.
Calm weather at both airports skips the model entirely (no cost, no quota). A
narrative is stored per flight and reused while the facts are unchanged (up to
an hour), so many opens cost one model call; only generating a fresh one spends
a question from the caller's daily quota.

**Assistant**: "Ask FlightIQ" is given the same findings, so questions like
"should I leave later because of the weather?" are answered from real data.

**Known gaps**: no runway-specific crosswind (needs a runway reference); flights
more than about a week out have no outlook yet and say so; NWS alerts are US
only; a live `weather-insights` call for a flight costs one AeroAPI lookup only
on a cache miss.

## Cost: daily spend from `ai_calls`

Run in the SQL editor (service role). Rates are $/million tokens for the
models in `functions/_shared/config.ts` as of writing — **update them if
pricing or the models change**: Sonnet 5 = 2 in / 10 out, Haiku 4.5 = 1 in / 5 out;
cache reads bill at 0.1× input and cache writes at 1.25× input.

```sql
select
  date_trunc('day', created_at)::date                        as day,
  model,
  count(*)                                                    as calls,
  sum(input_tokens)                                           as input_tokens,
  sum(cache_read_tokens)                                      as cache_read,
  sum(cache_write_tokens)                                     as cache_write,
  sum(output_tokens)                                          as output_tokens,
  count(*) filter (where error is not null)                   as errors,
  round(avg(latency_ms))                                      as avg_latency_ms,
  round((
    case when model like 'claude-haiku%' then 1.0 else 2.0 end
      * (coalesce(sum(input_tokens),0) + 0.1 * coalesce(sum(cache_read_tokens),0) + 1.25 * coalesce(sum(cache_write_tokens),0))
    + case when model like 'claude-haiku%' then 5.0 else 10.0 end * coalesce(sum(output_tokens),0)
  ) / 1e6, 4)                                                 as est_usd
from ai_calls
group by 1, 2
order by 1 desc, 2;
```

## Testing

```bash
npm test                     # app (jest)
npm run test:functions       # Edge Functions (deno test) — needs Deno
npm run check:functions      # type-check the three functions
```

The handler tests use a fake database and a fake model, so they cost
nothing and need no network or keys. They do **not** call the live
Anthropic API — after deploying, ask one real question in the app (or
`curl` the function with a user JWT) and confirm the answer, `ai_calls`
row and `basedOn` look right.

## Known gaps (next real steps)

- **No delay forecast.** Nothing in the backend produces a probability, and
  the assistant is instructed never to state one. That is Phase 3 of the
  roadmap (`docs/FLIGHTIQ_AI_ROADMAP.md`).
- **The assistant has no tools yet.** It sees the flight, the weather
  findings, its inbound aircraft and (while airborne) its position — loaded
  once, up front. FAA ground programs, alternatives and trips arrive with
  Phase 1–2 (METAR/TAF and NWS alerts are already in via the weather stack).
- **Guest accounts weaken per-user limits** (see above); the global cap is the backstop.
- **OpenSky is unused.** `OPENSKY_*` secrets are still accepted but nothing reads them;
  real inbound-aircraft data comes from AeroAPI.
