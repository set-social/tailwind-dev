import type { AssistantAnswer } from "@/lib/data/assistant";
import { answerFor, fallbackAnswer } from "@/lib/data/assistant";
import type { Flight } from "@/lib/types";
import { hasLiveAssistant } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/** "Ask TailWind" — scoped to one flight's own Sense/Predict data, never a general chatbot. */
export interface AssistantProvider {
  ask(question: string, flight: Flight): Promise<AssistantAnswer>;
}

class MockAssistantProvider implements AssistantProvider {
  async ask(question: string): Promise<AssistantAnswer> {
    // Canned lookup table today; see lib/data/assistant.ts.
    return answerFor(question);
  }
}

/**
 * Calls the `assistant` Supabase Edge Function (supabase/functions/assistant),
 * which holds ANTHROPIC_API_KEY server-side — the key never ships in this
 * app's bundle. Falls back to the mock answer if the function isn't
 * deployed/configured yet (501) or the call fails outright, so a missing
 * backend degrades gracefully instead of breaking the screen.
 */
class RemoteAssistantProvider implements AssistantProvider {
  async ask(question: string, flight: Flight): Promise<AssistantAnswer> {
    if (!supabase) return fallbackAnswer;
    const { data, error } = await supabase.functions.invoke("assistant", {
      body: { question, flight },
    });
    if (error || !data || data.error) {
      console.warn("assistant function unavailable, falling back to mock:", error ?? data?.error);
      return answerFor(question);
    }
    return data as AssistantAnswer;
  }
}

function createAssistantProvider(): AssistantProvider {
  if (hasLiveAssistant && supabase) return new RemoteAssistantProvider();
  return new MockAssistantProvider();
}

export const assistantProvider: AssistantProvider = createAssistantProvider();
