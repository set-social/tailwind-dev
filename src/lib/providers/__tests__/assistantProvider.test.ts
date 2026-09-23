export {};
// The provider picks Remote vs Mock at import time from config, so each case
// loads a fresh copy of it against a fake Supabase client.
const invoke = jest.fn();
let FunctionsHttpErrorClass: new (context: unknown) => Error;

function load(hasLive: boolean) {
  jest.resetModules();
  jest.doMock("@/lib/config", () => ({ hasLiveAssistant: hasLive }));
  jest.doMock("@/lib/supabase", () => ({ supabase: hasLive ? { functions: { invoke } } : null }));
  // Load supabase-js AFTER the reset so the provider's `instanceof FunctionsHttpError` sees the same class we build errors from.
  FunctionsHttpErrorClass = require("@supabase/supabase-js").FunctionsHttpError;
  return require("@/lib/providers/assistantProvider").assistantProvider as import("@/lib/providers/assistantProvider").AssistantProvider;
}

/** What supabase-js hands back for a non-2xx: a FunctionsHttpError whose context is the Response. */
function httpError(status: number, body: unknown) {
  return new FunctionsHttpErrorClass({ status, json: async () => { if (body === undefined) throw new Error("not json"); return body; } });
}

beforeEach(() => { invoke.mockReset(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

const CTX = { flightKey: "UA1482:2026-09-22" };

test("no backend configured: falls back to the mock answers so the app still runs", async () => {
  const provider = load(false);
  const a = await provider.ask("why is my flight delayed?", CTX);
  expect(a.answer.length).toBeGreaterThan(0);
  expect(invoke).not.toHaveBeenCalled();
});

test("sends only the question and the flight key — never flight data", async () => {
  const provider = load(true);
  invoke.mockResolvedValue({ data: { answer: ["Your aircraft is late."], basedOn: ["Flight status"] }, error: null });
  const a = await provider.ask("What's going on?", CTX);
  expect(invoke).toHaveBeenCalledWith("assistant", { body: { question: "What's going on?", flightKey: "UA1482:2026-09-22" } });
  expect(a).toEqual({ answer: ["Your aircraft is late."], basedOn: ["Flight status"] });
});

test("a rate-limit response shows the server's own message, with no evidence attached", async () => {
  const provider = load(true);
  invoke.mockResolvedValue({ data: null, error: httpError(429, { error: "rate_limited", message: "You've used your 25 questions for today." }) });
  const a = await provider.ask("hi", CTX);
  expect(a).toEqual({ answer: ["You've used your 25 questions for today."], basedOn: [] });
});

test("a configured backend that fails never falls back to canned demo answers", async () => {
  const provider = load(true);
  invoke.mockResolvedValue({ data: null, error: httpError(500, undefined) });
  const a = await provider.ask("why is my flight delayed?", CTX);
  expect(a.answer[0]).toMatch(/isn't reachable/);
  expect(a.answer.join(" ")).not.toMatch(/38 minutes|Chicago|\d+%/);
  expect(a.basedOn).toEqual([]);
});

test("network failures and thrown errors also degrade to the honest message", async () => {
  const provider = load(true);
  invoke.mockResolvedValueOnce({ data: null, error: new Error("network down") });
  expect((await provider.ask("q", CTX)).answer[0]).toMatch(/isn't reachable/);
  invoke.mockRejectedValueOnce(new Error("boom"));
  expect((await provider.ask("q", CTX)).answer[0]).toMatch(/isn't reachable/);
});

test("a malformed success body is treated as unavailable, not rendered", async () => {
  const provider = load(true);
  invoke.mockResolvedValue({ data: { answer: "not an array" }, error: null });
  expect((await provider.ask("q", CTX)).answer[0]).toMatch(/isn't reachable/);
});
