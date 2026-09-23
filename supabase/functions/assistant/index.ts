// "Ask FlightIQ" — supabase/functions/assistant
//
// Holds ANTHROPIC_API_KEY server-side (set via `supabase secrets set`) so it
// never ships in the RN app bundle. Deployed functions require a valid
// Supabase JWT by default, and this one additionally requires a real user
// (email or guest) so every call can be rate limited per person.
//
// Request:  POST { question: string; flightKey: string /* "UA1482:2026-09-22" */ }
// Response: AssistantAnswer — { answer: string[]; basedOn: string[]; follow?: string }
//           or { error: string; message: string } with 400/401/404/429/5xx.
// (AssistantAnswer mirrors src/lib/data/assistant.ts so the client's shape never changes.)
//
// The client sends ONLY a flight key. The flight is loaded here, from the
// same cache + AeroAPI path flight-lookup uses (_shared/flight-context.ts),
// so nothing the model sees can be spoofed or injected from the app side.
// The model is scoped to that one flight, never a general chatbot.

import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assistantDailyLimit, assistantGlobalDailyLimit } from "../_shared/config.ts";
import { buildFlightWeather } from "../_shared/wx-context.ts";
import { handleAssistant } from "./handler.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 }) : null;

Deno.serve((req) =>
  handleAssistant(req, {
    anthropicConfigured: anthropic !== null,
    db,
    createMessage: (params) => anthropic!.messages.create(params),
    weather: (r) => buildFlightWeather(db, r),
    // Read per request so a changed secret takes effect on the next cold start without a redeploy of code.
    limits: { user: assistantDailyLimit(), global: assistantGlobalDailyLimit() },
  })
);
