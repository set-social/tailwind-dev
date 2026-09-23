// "Weather & recommendations" — supabase/functions/weather-insights
//
// Request:  POST { flightKey: string /* "UA3611:2026-09-24" */ }
// Response: WeatherInsights (mirrors src/lib/types.ts): the deterministic
//           weather findings for the departure airport, the arrival airport
//           and the aircraft's earlier departure — real numbers from hourly
//           forecasts, METAR/TAF and NWS alerts — plus an AI-written
//           narrative (headline, insights, recommendations) when there is
//           something worth explaining. Or { error, message }.
//
// Claude narrates; it never measures or predicts (see _shared/wx-assess.ts
// for the rules and _shared/wx-narrative.ts for the guard that rejects any
// number not in the data). The findings are returned even when the model is
// unavailable, over its limit, or has nothing to add, so the app is never
// left with an empty weather card.
//
// Secrets: ANTHROPIC_API_KEY (narrative), AEROAPI_KEY (flight + airport
// lookups on a cache miss). Weather sources are keyless. Optional:
// NWS_USER_AGENT.

import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assistantDailyLimit, assistantGlobalDailyLimit } from "../_shared/config.ts";
import { lookupFlight } from "../_shared/flight-context.ts";
import { buildFlightWeather } from "../_shared/wx-context.ts";
import { handleWeatherInsights } from "./handler.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 }) : null;

Deno.serve((req) =>
  handleWeatherInsights(req, {
    anthropicConfigured: anthropic !== null,
    db,
    createMessage: (params) => anthropic!.messages.create(params),
    lookup: (ident, date) => lookupFlight(db, ident, date),
    weather: (r) => buildFlightWeather(db, r),
    limits: { user: assistantDailyLimit(), global: assistantGlobalDailyLimit() },
  })
);
