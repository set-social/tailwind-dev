// Request handling for weather-insights, separated from Deno.serve so the
// ordering (validate -> authenticate -> load flight -> deterministic
// findings -> maybe spend quota on a narrative) can be unit-tested.

import type Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { MODELS } from "../_shared/config.ts";
import { authenticatedUserId } from "../_shared/auth.ts";
import { consumeAssistantCall } from "../_shared/rate-limit.ts";
import { logAiCall } from "../_shared/ai-log.ts";
import { parseFlightKey, UpstreamNotConfigured } from "../_shared/flight-context.ts";
import type { FlightLookupResult, WeatherInsights, WeatherNarrative } from "../_shared/types.ts";
import { hasNotableWeather, overallLevel, summaryLine, type FlightWeather } from "../_shared/wx-context.ts";
import { generateNarrative, narrativeInput, sha256Hex } from "../_shared/wx-narrative.ts";

export interface InsightsDeps {
  anthropicConfigured: boolean;
  db: SupabaseClient;
  createMessage: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  lookup: (ident: string, date: string) => Promise<FlightLookupResult | null>;
  weather: (r: FlightLookupResult) => Promise<FlightWeather>;
  limits: { user: number; global: number };
  now?: () => Date;
}

/** A narrative is reused while the facts it was written from are unchanged, for at most this long. */
const NARRATIVE_TTL_MS = 60 * 60_000;
/** After a failed generation for the same facts, wait this long before paying for another try. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

const fail = (status: number, error: string, message: string) => jsonResponse({ error, message }, status);

export async function handleWeatherInsights(req: Request, deps: InsightsDeps): Promise<Response> {
  const { db } = deps;
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

  let body: { flightKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Invalid JSON body.");
  }
  const flightKey = typeof body.flightKey === "string" ? body.flightKey.trim().toUpperCase() : "";
  const parsed = parseFlightKey(flightKey);
  if (!parsed) return fail(400, "bad_flight_key", "flightKey must look like UA1482:2026-09-22.");

  const userId = await authenticatedUserId(req, db);
  if (!userId) return fail(401, "unauthorized", "Sign in (or continue as guest) to see weather insights.");

  const now = deps.now?.() ?? new Date();
  try {
    const lookup = await deps.lookup(parsed.ident, parsed.date);
    if (!lookup) return fail(404, "flight_not_found", `FlightIQ couldn't find ${parsed.ident} on ${parsed.date}.`);

    // The findings are deterministic and free of model cost, so they're always returned.
    const weather = await deps.weather(lookup);
    const anyData = [weather.departure, weather.arrival, weather.inbound].some((a) => a?.dataAvailable);

    let narrative: WeatherNarrative | null = null;
    let narrativeStatus: WeatherInsights["narrativeStatus"] = anyData && !hasNotableWeather(weather) ? "calm" : "unavailable";

    if (anyData && hasNotableWeather(weather)) {
      const input = narrativeInput(lookup, weather);
      const hash = await sha256Hex(input);
      const { data: cached } = await db.from("weather_insights").select("*").eq("flight_key", flightKey).maybeSingle();
      const age = cached ? now.getTime() - Date.parse(cached.created_at) : Infinity;

      if (cached && cached.input_hash === hash && cached.narrative && age < NARRATIVE_TTL_MS) {
        narrative = cached.narrative as WeatherNarrative;
        narrativeStatus = "ai";
      } else if (cached && cached.input_hash === hash && !cached.narrative && age < RETRY_AFTER_FAILURE_MS) {
        narrativeStatus = "unavailable"; // tried moments ago with these same facts; don't pay again yet
      } else if (!deps.anthropicConfigured) {
        narrativeStatus = "unavailable";
      } else {
        // Only paying for a fresh narrative costs the caller a question from their daily quota.
        const quota = await consumeAssistantCall(db, userId, deps.limits.user, deps.limits.global);
        if (!quota.ok) {
          narrativeStatus = quota.reason === "unavailable" ? "unavailable" : "limit";
        } else {
          const started = Date.now();
          const logBase = { user_id: userId, function_name: "weather-insights", model: MODELS.reasoning, flight_key: flightKey };
          try {
            const gen = await generateNarrative(deps.createMessage, input);
            narrative = gen.narrative;
            narrativeStatus = narrative ? "ai" : "unavailable";
            await db.from("weather_insights").upsert({ flight_key: flightKey, input_hash: hash, narrative, created_at: now.toISOString() });
            await logAiCall(db, {
              ...logBase, input_tokens: gen.inputTokens, output_tokens: gen.outputTokens, cache_read_tokens: gen.cacheReadTokens,
              cache_write_tokens: gen.cacheWriteTokens, latency_ms: Date.now() - started, stop_reason: gen.stopReason,
              error: narrative ? null : `no usable narrative after ${gen.attempts} attempt(s): ${gen.rejected.join("; ").slice(0, 400)}`,
            });
          } catch (err) {
            console.error("weather narrative failed:", err);
            narrativeStatus = "unavailable";
            await logAiCall(db, { ...logBase, latency_ms: Date.now() - started, error: String(err).slice(0, 500) });
          }
        }
      }
    }

    const insights: WeatherInsights = {
      flightKey,
      generatedAt: now.toISOString(),
      level: overallLevel(weather),
      summaryLine: summaryLine(weather),
      departure: weather.departure,
      arrival: weather.arrival,
      inbound: weather.inbound,
      narrative,
      narrativeStatus,
    };
    return jsonResponse(insights);
  } catch (err) {
    console.error(err);
    if (err instanceof UpstreamNotConfigured) return fail(503, "unavailable", "Flight data isn't available right now. Try again in a moment.");
    return fail(500, "failed", "Something went wrong. Try again in a moment.");
  }
}
