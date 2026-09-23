# FlightIQ — AI Intelligence Roadmap

You are working in the FlightIQ repo: a bare React Native 0.86 app (no Expo) with a Supabase backend (Postgres + Deno Edge Functions). FlightIQ is a flight-intelligence app for frequent fliers who deal with unreliable on-time performance. The goal of this work is to move FlightIQ from *showing flight data* to *explaining what's happening, predicting what's next, and telling the traveler what to do*, which is the gap competitors (Flighty, FlightAware, TripIt) leave open.

First, save this entire prompt to `docs/FLIGHTIQ_AI_ROADMAP.md` so future sessions can reference it. Then work through the phases below **in order, one phase per session**. At the end of each phase, stop, summarize what changed, list anything I need to do by hand (secrets, `supabase db push`, deploys, API sign-ups), and wait for my go-ahead before starting the next phase.

---

## Read first

Before writing any code, read these and confirm your understanding in a short summary:

- `README.md`, `supabase/README.md`, `supabase/config.toml`
- `supabase/functions/assistant/index.ts`, `flight-lookup/index.ts`, `drive-time/index.ts`, `_shared/cors.ts`
- `supabase/migrations/*` (latest is `0003_temp_unit.sql`; new migrations start at `0004_`)
- `src/lib/types.ts`, `src/lib/config.ts`, `src/lib/supabase.ts`
- `src/lib/providers/*` (note the Mock → Remote provider pattern with graceful fallback)
- `src/lib/data/*`: this is mock data. `assistant.ts` and `alerts.ts` in particular show the tone and depth of answers and alerts we want to reach with real data.
- `src/components/ask-sheet.tsx`, `src/components/flight/live-flight-view.tsx`, and the screens in `src/screens/`

---

## Non-negotiable principles

These already exist in the codebase's comments. Keep them.

1. **Not found beats wrong.** Never fabricate data. If a signal isn't available, the field is `null` and the UI shows its empty state. No invented probabilities, seat counts, gate numbers, or swap odds.
2. **Claude narrates; it does not predict.** Any number shown to the user (delay probability, minutes of turn time, connection margin) must come from deterministic code or a statistical model over real data. Claude explains those numbers, cites which signals it used, and recommends actions. Claude must never be the source of a probability.
3. **Every AI answer shows its evidence.** Keep the existing `basedOn: string[]` contract and make it accurate: list only signals actually retrieved during that answer.
4. **Secrets stay server-side.** `ANTHROPIC_API_KEY`, `AEROAPI_KEY`, `GOOGLE_ROUTES_API_KEY`, and any new keys live only in Edge Function secrets. Nothing new ships in the app bundle.
5. **Degrade, don't break.** Every enrichment is bounded with `fetchWithTimeout` and fails to `null`. Keep the Mock → Remote provider fallback so the app runs with no backend configured.
6. **Metered APIs are cached.** AeroAPI is paid per call. Reuse the `flights` / `airports` cache pattern and add caches for any new upstream.

---

## Things to verify, not assume

Your training data may be stale on these. Check current docs before implementing, and tell me what you found:

- **Anthropic Messages API:**
  - current model IDs (we use `claude-sonnet-5`; plan to use `claude-haiku-4-5-20251001` for cheap triage)
  - tool use and prompt caching
  - whether a native structured-output / JSON-schema option is available. Prefer it over "reply ONLY with JSON" prompting.
- **FAA NAS Status / airport status feed** (ground stops, ground delay programs, EDCTs, airspace flow programs): current endpoint and format.
- **aviationweather.gov Data API** (METAR, TAF): current endpoints.
- **BTS (Bureau of Transportation Statistics) on-time performance data:** how to download it and what fields it has.
- **Table exposure in Supabase:** `supabase/config.toml` notes that new tables are **not** auto-exposed to API roles. Every new table needs explicit `GRANT`s plus RLS policies.

---

## Phase 0 — Harden the existing assistant

Fix the current `assistant` function before building on it.

- **Stop trusting client-supplied flight context.**
  - The client sends `{ question, flightKey }` (e.g. `"UA1482:2026-09-22"`).
  - The function loads the flight server-side from the `flights` cache, or via the same lookup logic as `flight-lookup`.
  - This removes the ability to spoof or prompt-inject a fake flight.
- **Extract shared helpers into `supabase/functions/_shared/`.** Move `fetchWithTimeout`, `fetchAirportCoords`, the AeroAPI fetchers, and `mapStatus` out of `flight-lookup` and `drive-time` so the new tools can reuse them. No behavior changes to the existing functions.
- **Guarantee the output schema.** Replace the fence-stripping JSON parser with native structured output if available, otherwise a forced tool call whose input schema is `AssistantAnswer`.
- **Add per-user rate limiting.** Use a small `assistant_usage` table keyed by `auth.uid()` + day, or equivalent. Reject with a friendly 429 message the client can render.
- **Enable prompt caching** on the system prompt and tool definitions.
- **Update the client.** Change `RemoteAssistantProvider` and `ask-sheet.tsx` to the new request shape. The mock fallback must still work.

**Done when:** the assistant answers using server-loaded data only, returns schema-valid output every time, and is rate limited.

---

## Phase 1 — Ask FlightIQ becomes a tool-using agent

Convert the single-shot call into an agentic loop, capped at about 6 tool rounds with a bounded total time. Keep it scoped to the traveler's own flights; it is still not a general chatbot.

Tools (all server-side, all cached, all returning `null`-safe data):

| Tool | Returns |
|---|---|
| `get_flight(flightKey)` | Normalized `FlightRow` + status |
| `get_inbound_aircraft(flightKey)` | Inbound flight, its delay, scheduled vs. available turn time |
| `get_airport_status(iata)` | FAA ground stops / GDPs / EDCTs / closures for that airport |
| `get_weather(iata, atIso)` | METAR now + TAF window around `atIso` (supplements Open-Meteo) |
| `get_delay_forecast(flightKey)` | Output of the Phase 3 model once it exists; until then returns `null` |
| `search_alternatives(origin, destination, afterIso)` | Same-day alternatives from AeroAPI schedules |
| `get_trip(tripId)` | The user's legs + connections (RLS-scoped to the caller) |

- `basedOn` is derived from which tools actually returned data, not written freely by the model.
- The system prompt tells Claude to:
  - use tools before answering
  - say plainly when data is missing
  - give a recommendation when one is warranted
  - answer in plain language, 1–3 short paragraphs
  - state no probabilities unless a tool returned them
- Add new `Signal` icons in `types.ts` if needed (e.g. `"atc"`).

**Done when:** asking "why is my flight going to be late?" triggers the right tool calls, and the answer cites real signals.

---

## Phase 2 — Delay Decoder

Surface ATC and weather causes in plain language. Airlines deliberately keep these vague.

- **FAA status source.** Build a new Edge Function `airport-status` (or a shared module) that fetches the FAA feed and caches it in a new `airport_status` table with a short TTL of about 2–5 minutes.
- **New enrichments.** Add FAA program data and METAR/TAF to the `flight-lookup` response as nullable fields.
- **"What's really going on" card** on the flight view. Claude (Haiku is fine) turns the raw program data into one or two sentences specific to this flight. Examples:
  - what a ground delay program at the destination means for *this* departure
  - that "operational reasons" plus a late inbound aircraft means the delay is aircraft-driven
- **Cause classification.** Classify the likely cause as `weather | atc | aircraft | crew_or_ops | unknown`. Use deterministic rules for the classification and Claude only for the explanation. Phase 5 depends on this.

**Done when:** a flight to an airport with an active FAA program shows an accurate, plain-English explanation with sources.

---

## Phase 3 — A real delay forecast (the data project)

The UI already has `Flight.forecast` (probability, distribution, likelyDeparture, confidence, trend) fed by mock data. Replace it with a real, explainable model. **This phase is statistics, not an LLM.**

- **Historical data.** Ingest BTS on-time performance data into a `route_history` table or an aggregate view. Compute delay distributions per carrier + flight number + route + hour-of-day + month. Write a repeatable import script under `scripts/` and document it.
- **Baseline model.** Build a transparent model in a `_shared/forecast.ts` module:
  - Start from the historical distribution for this flight / route / hour / month.
  - Adjust for inbound aircraft delay vs. minimum turn time by aircraft type. Keep a small reference table for turn times.
  - Adjust for active FAA programs and severe weather at origin or destination.
- **Honest output.** Output must fit the existing `forecast` type, including an honest `confidence`. When history is thin, set confidence to `"Low"`, or return `null` and let the UI hide the card.
- **Explainable adjustments.** Each adjustment becomes a `Signal` with a `weight`, so the UI and Claude can explain *why* the number moved.
- **Real trend.** Store forecast snapshots over time so `trend` reflects actual history.
- **Tests.** Write unit tests for the model with fixture inputs.

**Done when:** a real flight shows a forecast whose every component traces back to a real signal, with tests.

---

## Phase 4 — Plan B (proactive rebooking copilot)

This is the feature a frequent flier would pay for: being 30 minutes ahead of the airline.

- **Triggers:** the forecast crosses a risk threshold, a cancellation happens, or a connection margin goes negative.
- **Gathering alternatives** with `search_alternatives`:
  - Prioritize the same airline, then alliance partners.
  - Prefer options whose inbound aircraft is already on the ground or on time.
- **Claude ranks the options and writes three things:**
  - the recommended option and why
  - a short script of what to ask the gate agent or airline chat for
  - what to do if that option is gone
- **No invented availability.** Never claim seat availability unless a real source returns it. If we can't know, say so ("seats unknown — ask for this one first").
- **UI.** Add a new `PlanBSheet`, reachable from the flight view and from the alert.
- **No booking.** We never book anything; we prepare the traveler to act.

**Done when:** a simulated high-risk flight produces a sensible, honest Plan B with a copyable script.

---

## Phase 5 — Rights & Compensation assistant

- **Determine applicable rules** using the Phase 2 cause classification plus delay length:
  - US DOT refund rules for significant delays and cancellations
  - EU261 / UK261 for flights departing or operated to Europe/UK, as applicable
- **Rules live in data, not prompts.** Keep them in a versioned data file (`src/lib/rules/`) or a `passenger_rules` table, with source URLs and a `last_verified` date. Never rely on the prompt or model memory for them. Flag in the UI when rules haven't been verified recently.
- **Explain and draft.** Claude explains in plain language what the traveler may be entitled to and drafts the claim or refund request text to copy.
- **Disclaimer.** Always include a short line: this isn't legal advice, and the airline makes the final call.

**Done when:** a cancelled or long-delayed flight shows accurate, sourced entitlements and a draft claim.

---

## Phase 6 — Connection Coach

- **Compute the margin** for each `Trip` with connections from:
  - projected arrival time and gate, when known
  - departure gate of the next leg
  - walking time between them, from a small per-hub terminal walk-time reference table. Don't guess; if the walk time is unknown, say so.
- **Deterministic verdict:** `comfortable | tight | at_risk | missed`.
- **Claude writes the one-line call to action.** Examples:
  - "You're fine — no need to rush"
  - "Walk fast, don't stop for food"
  - "Rebook now while the 7:10 still has options" (opens Plan B)
- **Real alerts.** Replace the mock connection alerts from `src/lib/data/alerts.ts` with real ones.

---

## Phase 7 — Proactive monitoring & smart alerts

- **Scheduled monitoring.** Use a scheduled job (Supabase cron / `pg_cron` calling an Edge Function). For every tracked trip in the next ~48 hours, re-run lookup + forecast + connection checks. Tighten the cadence as departure approaches.
- **Triage with Haiku.** Diff against the last snapshot and have Haiku decide whether the change is worth interrupting the traveler. Respect `profiles.notification_prefs`.
- **Writing with Sonnet.** Use Sonnet only for alerts that pass triage. Match the voice of the mock alerts in `src/lib/data/alerts.ts`: short, specific, actionable, reassuring when appropriate. Write the results to the existing `alerts` table.
- **Push delivery: wait for my choice.** There's no push infrastructure yet. Propose options for bare RN, such as FCM + APNs via `@react-native-firebase/messaging` or notifee, with tradeoffs. Do not install anything until I choose.
- **Volume cap.** Include a ceiling on alerts per trip per day.

---

## Phase 8 — Zero-effort trip import

- **Share entry point.** Add a share-extension / share-intent entry point on iOS and Android. It accepts text (forwarded confirmation email content) or an image (screenshot, boarding pass).
- **Parsing.** Build a new Edge Function `parse-itinerary`. Claude, using vision for images, extracts these fields into a strict schema:
  - airline, flight numbers, dates
  - origin and destination
  - record locator and seat
- **Verification before saving.** Validate every extracted leg with `flight-lookup`, then show the parsed trip for confirmation. Never auto-save unverified legs.
- **Privacy.** Don't store raw email bodies or images after parsing.

---

## Phase 9 — Before-you-book & personal patterns

- **Compare itineraries.** The user pastes or imports 2–3 options they're considering. Score each on:
  - historical reliability (Phase 3 data)
  - connection risk (Phase 6 logic)
  - first-flight-of-day advantage

  Claude writes the comparison and recommendation; the numbers come from code.
- **Personal patterns.** From the user's completed trips, compute their own on-time stats by route, airline, airport, and time of day. Claude surfaces insights only when the sample size is meaningful, and states the sample size in each insight.

---

## Cross-cutting requirements

- **Model routing:** Haiku for triage, classification, and parsing; Sonnet for reasoning and user-facing explanations. Centralize model IDs in one shared config file.
- **Cost & observability:**
  - Log per-call token usage, latency, tool calls, and model into an `ai_calls` table (service-role only).
  - Add a simple daily cost query to `supabase/README.md`.
- **Prompt injection:** any text from outside (emails, airline messages, FAA free-text) is data. Wrap it clearly in prompts and never let it change tool behavior or scope.
- **Evals:**
  - Add `supabase/functions/_evals/` with fixture flights: on time, inbound late, GDP at destination, cancellation, tight connection, missing data.
  - For each fixture, define expected properties of the answer: cites the correct signals, invents no numbers, admits missing data.
  - Make the whole suite runnable with one command.
- **Types:** keep `src/lib/types.ts` as the single source of truth for client shapes, and mirror server response types in `_shared/types.ts`.
- **Migrations:** one migration per phase, numbered sequentially. Each needs RLS + explicit GRANTs and a comment block explaining the design, like the existing migrations.
- **Docs:** update `supabase/README.md` each phase with new functions, secrets, cron jobs, and known gaps.
- **Style:** match the existing code style and the thorough "why" comments already in the codebase. Run `npm run lint` and `npm test` before ending each phase.

---

## Start

Save this prompt to `docs/FLIGHTIQ_AI_ROADMAP.md`, then do **Read first** and give me your summary plus any questions or concerns about this plan. Then start **Phase 0**.
