import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { ANSWER_SCHEMA, buildAssistantContext, formatLocal, restrictBasedOn, SYSTEM_PROMPT, validateAnswer } from "./assistant-core.ts";
import { fixtures } from "../_evals/fixtures.ts";

const NOW = "2026-09-23T19:30:00Z";

Deno.test("formatLocal renders in the airport's own timezone, not UTC", () => {
  assertEquals(formatLocal("2026-09-23T22:45:00Z", "America/New_York"), "Sep 23, 6:45 PM EDT");
  assertEquals(formatLocal("2026-09-23T22:45:00Z", "America/Los_Angeles"), "Sep 23, 3:45 PM PDT");
  assertEquals(formatLocal(null, "America/New_York"), null);
  assertEquals(formatLocal("not a date", "America/New_York"), null);
});

Deno.test("every fixture's context cites exactly the sources it actually contains", () => {
  for (const fx of fixtures) {
    const { context, availableSources } = buildAssistantContext(fx.data, NOW);
    assertEquals(availableSources, fx.expectSources, fx.name);
    assertEquals(context.available_sources, availableSources, fx.name);
  }
});

Deno.test("missing data stays null in the context instead of being filled in", () => {
  const fx = fixtures.find((f) => f.name.startsWith("missing data"))!;
  const { context } = buildAssistantContext(fx.data, NOW);
  const flight = context.flight as Record<string, any>;
  assertEquals(flight.departure.gate, null);
  assertEquals(flight.aircraft_type, null);
  assertEquals(context.inbound_aircraft, null);
  assertEquals(context.weather_at_origin, null);
  assertEquals(context.live_position, null);
  assert(String(flight.data_note).includes("schedule only"));
});

Deno.test("delay minutes are computed in code, and inbound delay is passed through", () => {
  const fx = fixtures.find((f) => f.name.startsWith("inbound"))!;
  const { context } = buildAssistantContext(fx.data, NOW);
  assertEquals((context.flight as any).departure.delay_minutes, 40);
  assertEquals((context.inbound_aircraft as any).delay_minutes, 38);
  assertEquals((context.weather_at_origin as any).summary, "Thunderstorms");
});

Deno.test("context never carries the raw AeroAPI payload or the flown track", () => {
  const fx = fixtures.find((f) => f.name.startsWith("inbound"))!;
  const json = JSON.stringify(buildAssistantContext(fx.data, NOW).context);
  assertFalse(json.includes("fa_flight_id"));
  assertFalse(json.includes("track"));
});

Deno.test("validateAnswer accepts a good answer and trims it", () => {
  const a = validateAnswer({ answer: ["  Your aircraft is late.  "], basedOn: ["Flight status"], follow: " Should I leave later? " });
  assertEquals(a, { answer: ["Your aircraft is late."], basedOn: ["Flight status"], follow: "Should I leave later?" });
});

Deno.test("validateAnswer treats null follow as absent and rejects unusable shapes", () => {
  assertEquals(validateAnswer({ answer: ["ok"], basedOn: [], follow: null }), { answer: ["ok"], basedOn: [] });
  assertEquals(validateAnswer(null), null);
  assertEquals(validateAnswer({ answer: [], basedOn: [], follow: null }), null);
  assertEquals(validateAnswer({ answer: ["   "], basedOn: [], follow: null }), null);
  assertEquals(validateAnswer({ answer: "text", basedOn: [], follow: null }), null);
  assertEquals(validateAnswer({ answer: ["ok"], basedOn: [1], follow: null }), null);
  assertEquals(validateAnswer({ answer: ["ok"], basedOn: [], follow: 5 }), null);
});

Deno.test("restrictBasedOn drops evidence the model wasn't given", () => {
  const out = restrictBasedOn(
    { answer: ["x"], basedOn: ["flight status", "Inbound aircraft UA 1845", "Historical performance", "Weather at LAX", "Flight status"] },
    ["Flight status", "Inbound aircraft UA 1845"],
  );
  assertEquals(out.basedOn, ["Flight status", "Inbound aircraft UA 1845"]);
});

Deno.test("the output schema requires every field and forbids extras", () => {
  assertEquals(ANSWER_SCHEMA.required, ["answer", "basedOn", "follow"]);
  assertEquals(ANSWER_SCHEMA.additionalProperties, false);
});

Deno.test("the system prompt is stable (cacheable) and forbids invented probabilities", () => {
  assertFalse(/\d{4}-\d{2}-\d{2}/.test(SYSTEM_PROMPT), "no dates in the cached prefix");
  assert(/never state or estimate a probability/i.test(SYSTEM_PROMPT));
});

// ── weather outlook in the assistant's context ───────────────────────────

import { assessAirport } from "./wx-assess.ts";
import type { HourPoint } from "./wx-parse.ts";
import type { FlightWeather } from "./wx-context.ts";

const H = 3_600_000;
const T0 = Date.parse("2026-09-23T00:00:00Z");
const gusty = (): HourPoint[] => Array.from({ length: 96 }, (_, h) => ({ ms: T0 + h * H, windKt: 17, gustKt: 27, dirDeg: 30, precipMm: 0, visMi: 10, tempC: 18, code: 3, pressureHpa: 1015 }));
const wxFor = (r: (typeof fixtures)[number]["data"]): FlightWeather => {
  const common = { nowMs: Date.parse(NOW), metar: null, taf: null, alerts: [], series: gusty() };
  return {
    departure: assessAirport({ ...common, airport: r.flight.origin, role: "departure", timezone: "America/New_York", focusIso: r.flight.scheduled_departure, focusVerb: "Departs", lat: 40.69, lon: -74.17 }),
    arrival: assessAirport({ ...common, airport: r.flight.destination, role: "arrival", timezone: "America/Los_Angeles", focusIso: "2026-09-24T22:53:00Z", focusVerb: "Arrives", lat: 40.69, lon: -74.17 }),
    inbound: null,
  };
};

Deno.test("with a weather outlook, the assistant is told the findings and may cite them; the single-hour snapshot is dropped for those airports", () => {
  const fx = fixtures.find((f) => f.name.startsWith("inbound"))!; // has single-hour weather at EWR
  const { context, availableSources } = buildAssistantContext(fx.data, NOW, wxFor(fx.data));
  assert(availableSources.includes("Weather outlook at EWR"));
  assert(availableSources.includes("Weather outlook at LAX"));
  assertFalse(availableSources.includes("Weather at EWR"));
  assertEquals(context.weather_at_origin, null);
  const outlook = context.weather_outlook as any;
  assert(outlook.departure_airport.findings.some((f: any) => f.topic === "wind"));
  assertEquals(outlook.aircraft_earlier_leg_airport, null);
  assertEquals(JSON.parse(JSON.stringify(context)).available_sources, availableSources);
});

Deno.test("without a weather outlook the old single-hour snapshot is still offered", () => {
  const fx = fixtures.find((f) => f.name.startsWith("inbound"))!;
  const { context, availableSources } = buildAssistantContext(fx.data, NOW, null);
  assert(availableSources.includes("Weather at EWR"));
  assertEquals(context.weather_outlook, null);
  assert(context.weather_at_origin !== null);
});

Deno.test("the system prompt tells the model how to use the outlook without inventing numbers", () => {
  assert(/weather_outlook/.test(SYSTEM_PROMPT));
  assert(/Do not add numbers that are not in the data/.test(SYSTEM_PROMPT));
});
