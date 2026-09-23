export {};
const invoke = jest.fn();

function load(configured = true) {
  jest.resetModules();
  jest.doMock("@/lib/supabase", () => ({ supabase: configured ? { functions: { invoke } } : null }));
  return require("@/lib/providers/weatherInsights") as typeof import("@/lib/providers/weatherInsights");
}

const insights = { flightKey: "UA3611:2026-09-24", departure: { airport: "XNA" }, arrival: { airport: "EWR" }, narrative: null };

beforeEach(() => { invoke.mockReset(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test("sends only the flight key and returns the insights", async () => {
  const { fetchWeatherInsights } = load();
  invoke.mockResolvedValue({ data: insights, error: null });
  expect(await fetchWeatherInsights("UA3611:2026-09-24")).toEqual(insights);
  expect(invoke).toHaveBeenCalledWith("weather-insights", { body: { flightKey: "UA3611:2026-09-24" } });
});

test("no backend configured: null, no call", async () => {
  const { fetchWeatherInsights } = load(false);
  expect(await fetchWeatherInsights("UA3611:2026-09-24")).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

test("errors, error bodies and malformed bodies all become null instead of throwing", async () => {
  const { fetchWeatherInsights } = load();
  invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
  expect(await fetchWeatherInsights("A1:2026-09-24")).toBeNull();
  invoke.mockResolvedValueOnce({ data: { error: "x", message: "y" }, error: null });
  expect(await fetchWeatherInsights("A2:2026-09-24")).toBeNull();
  invoke.mockResolvedValueOnce({ data: { nope: 1 }, error: null });
  expect(await fetchWeatherInsights("A3:2026-09-24")).toBeNull();
  invoke.mockRejectedValueOnce(new Error("network"));
  expect(await fetchWeatherInsights("A4:2026-09-24")).toBeNull();
});

test("the same flight asked twice in quick succession is one request", async () => {
  const { fetchWeatherInsights } = load();
  invoke.mockResolvedValue({ data: insights, error: null });
  const [a, b] = await Promise.all([fetchWeatherInsights("UA3611:2026-09-24"), fetchWeatherInsights("UA3611:2026-09-24")]);
  await fetchWeatherInsights("UA3611:2026-09-24");
  expect(a).toEqual(b);
  expect(invoke).toHaveBeenCalledTimes(1);
});

test("a failure is retried soon, not cached as if it were an answer; force always refetches", async () => {
  const { fetchWeatherInsights, clearWeatherInsightsCache } = load();
  invoke.mockResolvedValueOnce({ data: null, error: new Error("x") });
  expect(await fetchWeatherInsights("K:2026-09-24")).toBeNull();
  clearWeatherInsightsCache();
  invoke.mockResolvedValueOnce({ data: insights, error: null });
  expect(await fetchWeatherInsights("K:2026-09-24")).toEqual(insights);
  invoke.mockResolvedValueOnce({ data: { ...insights, narrative: { headline: "new" } }, error: null });
  expect((await fetchWeatherInsights("K:2026-09-24", { force: true }))?.narrative).toEqual({ headline: "new" });
});
