// "Ask TailWind" — supabase/functions/assistant
//
// Holds ANTHROPIC_API_KEY server-side (set via `supabase secrets set`) so it
// never ships in the RN app bundle. Deployed functions require a valid
// Supabase JWT by default (the anon key counts), so this isn't open to the
// public internet — but it IS reachable by any signed-in-or-anon app
// install, so keep it scoped to one flight's own data, never a general
// chatbot, per the product rule in src/lib/providers/assistantProvider.ts.
//
// Request:  POST { question: string; flight: unknown /* FlightDetail-shaped */ }
// Response: AssistantAnswer — { answer: string[]; basedOn: string[]; follow?: string }
// (mirrors src/lib/data/assistant.ts so the client's shape never changes.)

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-5";

interface AskRequest {
  question: string;
  flight: unknown;
}

const SYSTEM_PROMPT = `You are "Ask TailWind," scoped to exactly one flight's own data — never a general chatbot.
Answer only using the JSON flight context given in the user message. If the context doesn't cover the question, say so plainly instead of guessing.
Reply with ONLY a JSON object, no markdown fences, matching exactly:
{"answer": string[], "basedOn": string[], "follow": string | null}
- "answer": 1-3 short paragraphs, plain language, no hedging filler.
- "basedOn": the specific signals/sources from the context this answer actually used.
- "follow": one natural next question the traveler might ask, or null.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured — run `supabase secrets set`." }, 501);
  }

  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  if (!body.question || !body.flight) {
    return jsonResponse({ error: "question and flight are required" }, 400);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Flight context:\n${JSON.stringify(body.flight)}\n\nQuestion: ${body.question}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic error", res.status, await res.text());
      return jsonResponse({ error: "assistant upstream request failed" }, 502);
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    return jsonResponse(parseAnswer(text));
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "assistant failed", detail: String(err) }, 500);
  }
});

function parseAnswer(text: string): { answer: string[]; basedOn: string[]; follow?: string } {
  try {
    const cleaned = text.trim().replace(/^```(json)?/, "").replace(/```$/, "").trim();
    const obj = JSON.parse(cleaned);
    return {
      answer: Array.isArray(obj.answer) ? obj.answer : [String(obj.answer ?? text)],
      basedOn: Array.isArray(obj.basedOn) ? obj.basedOn : [],
      follow: obj.follow ?? undefined,
    };
  } catch {
    // Model didn't return clean JSON — still surface something useful
    // rather than a 500, since the content itself is probably fine.
    return { answer: [text || "I couldn't find a confident answer to that."], basedOn: [] };
  }
}
