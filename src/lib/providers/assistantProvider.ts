import { FunctionsHttpError } from "@supabase/supabase-js";
import type { AssistantAnswer } from "@/lib/data/assistant";
import { answerFor } from "@/lib/data/assistant";
import { hasLiveAssistant } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/** What the assistant is asked about. The server loads the flight itself from this key; the app never sends flight data. */
export interface AskContext {
  /** e.g. "UA1482:2026-09-22" — LiveFlight.flightKey. */
  flightKey: string;
}

/** "Ask FlightIQ" — scoped to one flight, never a general chatbot. */
export interface AssistantProvider {
  ask(question: string, ctx: AskContext): Promise<AssistantAnswer>;
}

/**
 * Only used when NO backend is configured (a bare checkout with no .env), so
 * the app still runs. These are canned answers about the demo flight, not
 * about whatever flight is on screen — which is why a *configured* backend
 * that fails does not fall back to them (see RemoteAssistantProvider).
 */
class MockAssistantProvider implements AssistantProvider {
  async ask(question: string): Promise<AssistantAnswer> {
    return answerFor(question);
  }
}

const UNAVAILABLE = "FlightIQ's assistant isn't reachable right now. Try again in a moment.";

/** A plain-language answer that carries no evidence — used when we have to say "I couldn't". */
const notice = (message: string): AssistantAnswer => ({ answer: [message], basedOn: [] });

/**
 * Calls the `assistant` Supabase Edge Function (supabase/functions/assistant),
 * which holds ANTHROPIC_API_KEY server-side — the key never ships in this
 * app's bundle.
 *
 * When the backend is configured but the call fails (rate limit, outage, not
 * deployed yet), the traveler gets an honest message, NOT a canned answer:
 * showing the demo flight's "68% delay risk" under a different real flight
 * would be exactly the invented data this app refuses to show.
 */
class RemoteAssistantProvider implements AssistantProvider {
  async ask(question: string, { flightKey }: AskContext): Promise<AssistantAnswer> {
    if (!supabase) return notice(UNAVAILABLE);
    try {
      const { data, error } = await supabase.functions.invoke("assistant", { body: { question, flightKey } });
      if (error) return await noticeFromError(error);
      if (!data || !Array.isArray(data.answer)) return notice(UNAVAILABLE);
      return data as AssistantAnswer;
    } catch (err) {
      console.warn("assistant call failed:", err);
      return notice(UNAVAILABLE);
    }
  }
}

/** The function's own error bodies are `{ error, message }` with a message written for the traveler (rate limits, flight not found). */
async function noticeFromError(error: unknown): Promise<AssistantAnswer> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await (error.context as { json(): Promise<{ message?: unknown }> }).json();
      if (typeof body?.message === "string" && body.message.trim()) return notice(body.message);
    } catch { /* body wasn't JSON — fall through */ }
  }
  console.warn("assistant function unavailable:", error);
  return notice(UNAVAILABLE);
}

function createAssistantProvider(): AssistantProvider {
  if (hasLiveAssistant && supabase) return new RemoteAssistantProvider();
  return new MockAssistantProvider();
}

export const assistantProvider: AssistantProvider = createAssistantProvider();
