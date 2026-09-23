import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import type Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { handleWeatherInsights, type InsightsDeps } from "./handler.ts";
import { assessAirport } from "../_shared/wx-assess.ts";
import type { HourPoint } from "../_shared/wx-parse.ts";
import type { FlightLookupResult } from "../_shared/types.ts";
import type { FlightWeather } from "../_shared/wx-context.ts";
import { fixtures } from "../_evals/fixtures.ts";

console.error = () => {};

const HOUR = 3_600_000;
const START = Date.parse("2026-09-23T00:00:00Z");
const NOW = Date.parse("2026-09-23T17:15:00Z");

const pts = (fn: (h: number) => Partial<HourPoint>): HourPoint[] =>
  Array.from({ length: 96 }, (_, h) => ({ ms: START + h * HOUR, windKt: 5, gustKt: 8, dirDeg: 50, precipMm: 0, visMi: 10, tempC: 18, code: 3, pressureHpa: 1015, ...fn(h) }));

// UA 3611 style trip: calm at the departure airport, gusty northeast wind at the arrival airport.
const lookup: FlightLookupResult = {
  ...fixtures[0].data,
  flight: { ...fixtures[0].data.flight, flight_key: "UA3611:2026-09-24", flight_number: "3611", origin: "XNA", destination: "EWR", scheduled_departure: "2026-09-24T19:53:00Z", scheduled_arrival: "2026-09-24T22:53:00Z", estimated_departure: null, estimated_arrival: null },
};

const common = { nowMs: NOW, metar: null, taf: null, alerts: [] };
const xna = (series: HourPoint[]) => assessAirport({ ...common, airport: "XNA", role: "departure", timezone: "America/Chicago", focusIso: "2026-09-24T19:53:00Z", focusVerb: "Departs", lat: 36.28, lon: -94.31, series });
const ewr = (series: HourPoint[]) => assessAirport({ ...common, airport: "EWR", role: "arrival", timezone: "America/New_York", focusIso: "2026-09-24T22:53:00Z", focusVerb: "Arrives", lat: 40.69, lon: -74.17, series });

const CALM = pts(() => ({}));
const NE = pts((h) => (h < 66 ? { dirDeg: 30, windKt: 17, gustKt: 27 } : { dirDeg: 350, windKt: 8, gustKt: 16 }));

const weatherFor = (dep: HourPoint[], arr: HourPoint[]): FlightWeather => ({ departure: xna(dep), arrival: ewr(arr), inbound: null });

const good = { headline: "Gusty northeast wind at EWR around your 6:53 PM EDT arrival", insights: ["Northeast wind gusting 27 kt at EWR."], recommendations: [{ action: "Check status before leaving.", why: "Gusts reach 27 kt around your arrival." }] };
const message = (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) as unknown as Anthropic.Message;

interface Calls { rpc: number; models: number; aiCalls: any[]; store: Map<string, any> }

function setup(over: { userId?: string | null; weather?: FlightWeather; lookup?: FlightLookupResult | null; quota?: unknown; model?: () => Promise<Anthropic.Message>; anthropic?: boolean } = {}) {
  const calls: Calls = { rpc: 0, models: 0, aiCalls: [], store: new Map() };
  const db = {
    auth: { getUser: (t: string) => Promise.resolve("userId" in over && over.userId === null || t !== "jwt" ? { data: { user: null }, error: { message: "x" } } : { data: { user: { id: "u1" } }, error: null }) },
    rpc: () => { calls.rpc++; return Promise.resolve({ data: over.quota ?? { ok: true, used: 1 }, error: null }); },
    from: (table: string) => {
      let key = "";
      const q: any = {
        select: () => q, eq: (_c: string, v: string) => { key = v; return q; },
        maybeSingle: () => Promise.resolve({ data: table === "weather_insights" ? calls.store.get(key) ?? null : null }),
        upsert: (row: any) => { if (table === "weather_insights") calls.store.set(row.flight_key, row); return Promise.resolve({ error: null }); },
        insert: (row: any) => { if (table === "ai_calls") calls.aiCalls.push(row); return Promise.resolve({ error: null }); },
      };
      return q;
    },
  } as unknown as InsightsDeps["db"];
  const deps: InsightsDeps = {
    anthropicConfigured: over.anthropic ?? true, db,
    createMessage: () => { calls.models++; return (over.model ?? (() => Promise.resolve(message(JSON.stringify(good)))))(); },
    lookup: () => Promise.resolve("lookup" in over ? over.lookup! : lookup),
    weather: () => Promise.resolve(over.weather ?? weatherFor(CALM, NE)),
    limits: { user: 25, global: 2000 }, now: () => new Date(NOW),
  };
  return { deps, calls };
}

const post = (body: unknown, token: string | null = "jwt") =>
  new Request("https://x.test/w", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const ASK = { flightKey: "UA3611:2026-09-24" };

Deno.test("bad key is 400 and no user is 401, before any lookup, quota or model call", async () => {
  const { deps, calls } = setup();
  for (const [body, token, status] of [[{ flightKey: "nope" }, "jwt", 400], [{}, "jwt", 400], [ASK, null, 401], [ASK, "anon", 401]] as const) {
    const res = await handleWeatherInsights(post(body, token), deps);
    assertEquals(res.status, status);
    await res.body?.cancel();
  }
  assertEquals([calls.rpc, calls.models], [0, 0]);
});

Deno.test("gusty arrival airport: findings for both airports plus an AI narrative, quota spent once", async () => {
  const { deps, calls } = setup();
  const res = await handleWeatherInsights(post(ASK), deps);
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.narrativeStatus, "ai");
  assertEquals(out.narrative.headline, good.headline);
  assertEquals(out.level, "watch");
  assertEquals(out.departure.airport, "XNA");
  assertEquals(out.arrival.airport, "EWR");
  assertEquals(out.departure.level, "good");
  assertStringIncludes(out.summaryLine, "EWR");
  assertEquals([calls.rpc, calls.models], [1, 1]);
  assertEquals(calls.aiCalls[0].function_name, "weather-insights");
  assertEquals(calls.aiCalls[0].input_tokens, 1200);
});

Deno.test("asking again with unchanged facts reuses the stored narrative: no second model call and no second question spent", async () => {
  const { deps, calls } = setup();
  await (await handleWeatherInsights(post(ASK), deps)).body?.cancel();
  const res = await handleWeatherInsights(post(ASK), deps);
  const out = await res.json();
  assertEquals(out.narrativeStatus, "ai");
  assertEquals([calls.rpc, calls.models], [1, 1]);
});

Deno.test("changed facts regenerate the narrative (and it must use the new numbers)", async () => {
  const { deps, calls } = setup();
  await (await handleWeatherInsights(post(ASK), deps)).body?.cancel();
  deps.weather = () => Promise.resolve(weatherFor(CALM, pts((h) => (h < 66 ? { dirDeg: 30, windKt: 20, gustKt: 33 } : { dirDeg: 350 }))));
  // The fake model answers from the data it's given: now 33 kt, not 27.
  deps.createMessage = () => { calls.models++; return Promise.resolve(message(JSON.stringify({ ...good, insights: ["Northeast wind gusting 33 kt at EWR."], recommendations: [{ action: good.recommendations[0].action, why: "Gusts reach 33 kt around your arrival." }] }))); };
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrativeStatus, "ai");
  assertStringIncludes(out.narrative.insights[0], "33 kt");
  assertEquals([calls.rpc, calls.models], [2, 2]);
});

Deno.test("a stale narrative (numbers no longer in the data) is not accepted from the model", async () => {
  // The model keeps answering with last hour's 27 kt while the data now says 33 kt: rejected twice, never shown.
  const { deps, calls } = setup({ weather: weatherFor(CALM, pts((h) => (h < 66 ? { dirDeg: 30, windKt: 20, gustKt: 33 } : { dirDeg: 350 }))) });
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrative, null);
  assertEquals(calls.models, 2);
});

Deno.test("calm weather at both airports costs nothing: findings only, no quota, no model", async () => {
  const { deps, calls } = setup({ weather: weatherFor(CALM, CALM) });
  const res = await handleWeatherInsights(post(ASK), deps);
  const out = await res.json();
  assertEquals(out.narrativeStatus, "calm");
  assertEquals(out.narrative, null);
  assertEquals(out.level, "good");
  assertStringIncludes(out.summaryLine, "calm");
  assertEquals([calls.rpc, calls.models], [0, 0]);
});

Deno.test("out of questions: the findings are still returned, marked as limited, with no model call", async () => {
  const { deps, calls } = setup({ quota: { ok: false, reason: "user" } });
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrativeStatus, "limit");
  assertEquals(out.narrative, null);
  assertEquals(out.arrival.factors.length > 0, true);
  assertEquals(calls.models, 0);
});

Deno.test("no API key configured: findings only", async () => {
  const { deps, calls } = setup({ anthropic: false });
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrativeStatus, "unavailable");
  assertEquals(out.level, "watch");
  assertEquals([calls.rpc, calls.models], [0, 0]);
});

Deno.test("a narrative with invented numbers is rejected twice and never shown", async () => {
  const bad = message(JSON.stringify({ ...good, recommendations: [{ action: "Leave 90 minutes earlier.", why: "Gusts reach 27 kt." }] }));
  const { deps, calls } = setup({ model: () => Promise.resolve(bad) });
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrative, null);
  assertEquals(out.narrativeStatus, "unavailable");
  assertEquals(calls.models, 2);
  assertStringIncludes(calls.aiCalls[0].error, "90");
  // The findings are unaffected.
  assertEquals(out.arrival.level, "watch");
});

Deno.test("a failed generation isn't retried (and re-billed) on the next request with the same facts", async () => {
  const bad = message(JSON.stringify({ ...good, headline: "Odds of delay are high" }));
  const { deps, calls } = setup({ model: () => Promise.resolve(bad) });
  await (await handleWeatherInsights(post(ASK), deps)).body?.cancel();
  const first = calls.models;
  const res = await handleWeatherInsights(post(ASK), deps);
  assertEquals((await res.json()).narrativeStatus, "unavailable");
  assertEquals(calls.models, first);
});

Deno.test("a model error degrades to findings only and is logged", async () => {
  const { deps, calls } = setup({ model: () => Promise.reject(new Error("upstream down")) });
  const res = await handleWeatherInsights(post(ASK), deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).narrativeStatus, "unavailable");
  assertStringIncludes(calls.aiCalls[0].error, "upstream down");
});

Deno.test("no weather data anywhere (e.g. a flight weeks out): unavailable, no spend", async () => {
  const none = { departure: xna([]), arrival: ewr([]), inbound: null };
  none.departure = assessAirport({ ...common, airport: "XNA", role: "departure", timezone: null, focusIso: "2026-12-01T19:53:00Z", focusVerb: "Departs", lat: 36, lon: -94, series: null });
  none.arrival = assessAirport({ ...common, airport: "EWR", role: "arrival", timezone: null, focusIso: "2026-12-01T22:53:00Z", focusVerb: "Arrives", lat: 40, lon: -74, series: null });
  const { deps, calls } = setup({ weather: none });
  const out = await (await handleWeatherInsights(post(ASK), deps)).json();
  assertEquals(out.narrativeStatus, "unavailable");
  assertEquals(out.departure.dataAvailable, false);
  assertStringIncludes(out.summaryLine, "isn't available");
  assertEquals([calls.rpc, calls.models], [0, 0]);
});

Deno.test("unknown flight is a 404", async () => {
  const { deps } = setup({ lookup: null });
  const res = await handleWeatherInsights(post(ASK), deps);
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

Deno.test("the response never contains raw upstream payloads or secrets", async () => {
  const { deps } = setup();
  const text = await (await handleWeatherInsights(post(ASK), deps)).text();
  assertFalse(/apikey|api_key|service_role/i.test(text));
  assert(text.length < 40_000, `response is ${text.length} bytes`);
});
