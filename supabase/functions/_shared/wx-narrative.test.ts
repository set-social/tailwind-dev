import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import type Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { generateNarrative, NARRATIVE_SYSTEM, problemsWith, sha256Hex, ungroundedNumbers, validateNarrative } from "./wx-narrative.ts";

const INPUT = JSON.stringify({ flight: { code: "UA 3611" }, findings: [{ detail: "NE 17 kt gusting 28 kt around 6:53 PM EDT (Forecast). Gusts reach 29 kt on Fri Sep 25." }], visibility_mi: 10 });

const good = { headline: "Gusty northeast wind at EWR around your 6:53 PM arrival", insights: ["NE 17 kt gusting 28 kt at EWR."], recommendations: [{ action: "Check status before you leave.", why: "Gusts reach 29 kt on Fri Sep 25." }] };

Deno.test("numbers copied from the data are grounded; invented ones are caught", () => {
  assertEquals(ungroundedNumbers(good, INPUT), []);
  const bad = { ...good, recommendations: [{ action: "Leave 90 minutes earlier.", why: "Gusts reach 40 kt." }] };
  assertEquals(ungroundedNumbers(bad, INPUT).sort(), ["40", "90"]);
});

Deno.test("comma and decimal numbers are compared as written", () => {
  const only = (headline: string) => ({ headline, insights: [], recommendations: [] });
  assertEquals(ungroundedNumbers(only("Ceiling 1,000 ft"), JSON.stringify({ x: "ceiling 1000 ft" })), []);
  assertEquals(ungroundedNumbers(only("Rain 2.5 mm"), JSON.stringify({ x: "2.5" })), []);
  assertEquals(ungroundedNumbers(only("Rain 2.5 mm"), JSON.stringify({ x: "2 and 5" })), ["2.5"]); // 2.5 is not 2 or 5
});

Deno.test("probability language is rejected even when it uses no numbers", () => {
  for (const text of ["There is a 40% chance", "Odds of a delay are low", "The chance of a delay is small", "Delay probability is low", "a high likelihood of delays"]) {
    assert(problemsWith({ ...good, insights: [text] }, INPUT + "40").length > 0, text);
  }
  assertEquals(problemsWith(good, INPUT), []);
});

Deno.test("validateNarrative accepts the schema shape and rejects the rest", () => {
  assertEquals(validateNarrative(good)?.headline, good.headline);
  assertEquals(validateNarrative({ ...good, headline: "" }), null);
  assertEquals(validateNarrative({ ...good, headline: "x".repeat(200) }), null);
  assertEquals(validateNarrative({ ...good, insights: [1] }), null);
  assertEquals(validateNarrative({ ...good, recommendations: [{ action: "a" }] }), null);
  assertEquals(validateNarrative(null), null);
  assertEquals(validateNarrative({ ...good, insights: [] })?.insights, []); // calm weather may have none
});

const msg = (text: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text }], stop_reason: "end_turn",
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, ...extra,
}) as unknown as Anthropic.Message;

Deno.test("a draft with an invented number is retried once, with the reasons, and the second draft is used", async () => {
  const sent: string[] = [];
  const replies = [
    msg(JSON.stringify({ ...good, recommendations: [{ action: "Leave 90 minutes earlier.", why: "Gusts reach 29 kt." }] })),
    msg(JSON.stringify(good)),
  ];
  const r = await generateNarrative((p) => { sent.push(JSON.stringify(p.messages)); return Promise.resolve(replies.shift()!); }, INPUT);
  assertEquals(r.attempts, 2);
  assertEquals(r.narrative?.headline, good.headline);
  assertEquals(r.inputTokens, 2000);
  assert(sent[1].includes("rejected") && sent[1].includes("90"), "the retry tells the model what was wrong");
});

Deno.test("two bad drafts in a row yield no narrative rather than a bad one", async () => {
  const bad = msg(JSON.stringify({ ...good, insights: ["A 30% chance of delay."] }));
  const r = await generateNarrative(() => Promise.resolve(bad), INPUT);
  assertEquals(r.narrative, null);
  assertEquals(r.attempts, 2);
  assert(r.rejected.length > 0);
});

Deno.test("refusal and truncation stop immediately", async () => {
  let calls = 0;
  const r = await generateNarrative(() => { calls++; return Promise.resolve(msg("", { stop_reason: "refusal" })); }, INPUT);
  assertEquals([r.narrative, calls], [null, 1]);
  const t = await generateNarrative(() => Promise.resolve(msg("{", { stop_reason: "max_tokens" })), INPUT);
  assertEquals(t.narrative, null);
});

Deno.test("the request asks for structured output with a stable, cacheable system prompt", async () => {
  let params: any;
  await generateNarrative((p) => { params = p; return Promise.resolve(msg(JSON.stringify(good))); }, INPUT);
  assertEquals(params.output_config.format.type, "json_schema");
  assertEquals(params.system[0].cache_control, { type: "ephemeral" });
  assert(params.messages[0].content.startsWith("<weather_data>"));
  assertFalse(/\d{4}-\d{2}-\d{2}/.test(NARRATIVE_SYSTEM));
});

Deno.test("sha256Hex is stable and sensitive to any change", async () => {
  assertEquals(await sha256Hex("a"), await sha256Hex("a"));
  assert((await sha256Hex("a")) !== (await sha256Hex("b")));
  assertEquals((await sha256Hex("a")).length, 64);
});
