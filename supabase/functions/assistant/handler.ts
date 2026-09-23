// The request handling for "Ask FlightIQ", separated from Deno.serve so its
// security-critical ordering (authenticate -> spend quota -> load flight ->
// call the model) can be unit-tested with a fake database and a fake model.
// See index.ts for the request/response contract.

import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { MODELS } from "../_shared/config.ts";
import { authenticatedUserId } from "../_shared/auth.ts";
import { consumeAssistantCall } from "../_shared/rate-limit.ts";
import { logAiCall } from "../_shared/ai-log.ts";
import { lookupFlight, parseFlightKey, UpstreamNotConfigured } from "../_shared/flight-context.ts";
import type { FlightLookupResult } from "../_shared/types.ts";
import type { FlightWeather } from "../_shared/wx-context.ts";
import {
  ANSWER_SCHEMA, buildAssistantContext, restrictBasedOn, SYSTEM_PROMPT, validateAnswer,
} from "../_shared/assistant-core.ts";

export interface AssistantDeps {
  anthropicConfigured: boolean;
  db: SupabaseClient;
  createMessage: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  limits: { user: number; global: number };
  /** Weather findings for the flight (cache-backed). Optional: without it the assistant only has the single-hour snapshot. */
  weather?: (r: FlightLookupResult) => Promise<FlightWeather>;
  now?: () => Date;
}

const MAX_QUESTION_CHARS = 500;

interface AskRequest {
  question?: unknown;
  flightKey?: unknown;
}

const fail = (status: number, error: string, message: string) => jsonResponse({ error, message }, status);

export async function handleAssistant(req: Request, deps: AssistantDeps): Promise<Response> {
  const { db, limits } = deps;
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

  if (!deps.anthropicConfigured) {
    return fail(501, "not_configured", "ANTHROPIC_API_KEY not configured — run `supabase secrets set`.");
  }

  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Invalid JSON body.");
  }
  // Only these two fields are ever read. Anything else in the body — a
  // "flight" object, a "system" override — is ignored, not trusted.
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const flightKey = typeof body.flightKey === "string" ? body.flightKey.trim().toUpperCase() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return fail(400, "bad_question", `Ask a question of up to ${MAX_QUESTION_CHARS} characters.`);
  }
  const parsed = parseFlightKey(flightKey);
  if (!parsed) return fail(400, "bad_flight_key", "flightKey must look like UA1482:2026-09-22.");

  const userId = await authenticatedUserId(req, db);
  if (!userId) return fail(401, "unauthorized", "Sign in (or continue as guest) to ask FlightIQ.");

  // Quota is spent before any paid call (AeroAPI on a cache miss, then the model).
  const quota = await consumeAssistantCall(db, userId, limits.user, limits.global);
  if (!quota.ok) {
    if (quota.reason === "unavailable") return fail(503, "unavailable", "Ask FlightIQ is unavailable right now. Try again in a moment.");
    return quota.reason === "global"
      ? fail(429, "rate_limited", "Ask FlightIQ is very busy today. Please try again tomorrow.")
      : fail(429, "rate_limited", `You've used your ${quota.limit} questions for today. They reset at midnight UTC.`);
  }

  const started = Date.now();
  const logBase = { user_id: userId, function_name: "assistant", model: MODELS.reasoning, flight_key: flightKey };

  try {
    const result = await lookupFlight(db, parsed.ident, parsed.date);
    if (!result) return fail(404, "flight_not_found", `FlightIQ couldn't find ${parsed.ident} on ${parsed.date}.`);

    // Weather is an enrichment: if it fails, the assistant still answers from the rest.
    const wx = deps.weather ? await deps.weather(result).catch((err) => { console.error("weather for assistant failed:", err); return null; }) : null;
    const { context, availableSources } = buildAssistantContext(result, (deps.now?.() ?? new Date()).toISOString(), wx);

    const response = await deps.createMessage({
      model: MODELS.reasoning,
      max_tokens: 1500,
      // The system prompt is the stable, cacheable prefix; everything that
      // varies per request goes in the user message after it.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      // Native structured output: the API guarantees the reply parses as
      // ANSWER_SCHEMA, so there's no fence-stripping or "reply ONLY with JSON".
      output_config: { effort: "low", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `<flight_context>\n${JSON.stringify(context)}\n</flight_context>\n\n<question>\n${question}\n</question>`,
        },
      ],
    });

    await logAiCall(db, {
      ...logBase,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
      latency_ms: Date.now() - started,
      stop_reason: response.stop_reason,
    });

    if (response.stop_reason === "refusal") {
      return jsonResponse({
        answer: ["I can't help with that one. I can explain this flight's status, its aircraft, the weather, or when to leave for the airport."],
        basedOn: [],
      });
    }
    if (response.stop_reason === "max_tokens") return fail(502, "incomplete", "FlightIQ's answer was cut off. Please try again.");

    const text = response.content.find((b) => b.type === "text");
    let answer = null;
    try {
      answer = text && text.type === "text" ? validateAnswer(JSON.parse(text.text)) : null;
    } catch { /* falls through to the failure below */ }
    if (!answer) return fail(502, "bad_model_output", "FlightIQ couldn't put together an answer. Please try again.");

    return jsonResponse(restrictBasedOn(answer, availableSources));
  } catch (err) {
    console.error(err);
    await logAiCall(db, { ...logBase, latency_ms: Date.now() - started, error: String(err).slice(0, 500) });
    if (err instanceof UpstreamNotConfigured) return fail(503, "unavailable", "Flight data isn't available right now. Try again in a moment.");
    if (err instanceof Anthropic.RateLimitError) return fail(503, "busy", "FlightIQ is busy right now. Try again in a moment.");
    if (err instanceof Anthropic.APIError) return fail(502, "upstream", "FlightIQ couldn't reach its assistant. Try again in a moment.");
    return fail(500, "failed", "Something went wrong. Try again in a moment.");
  }
}
