import { buildChart, ceilingLabel, levelForGust, shortDay, skyLabel, visLabel, windLabel } from "@/lib/weatherFormat";
import type { WxConditions } from "@/lib/types";

const cond = (over: Partial<WxConditions> = {}): WxConditions => ({
  atIso: "2026-09-24T22:53:00Z", atLocal: "6:53 PM EDT", source: "TAF", windDirDeg: 30, windDirName: "NNE", windKt: 15, gustKt: 25,
  visibilityMi: 6, ceilingFt: 5000, flightCategory: "VFR", precipMmHr: 0, tempC: 16, summary: "Overcast", ...over,
});

test("labels read the way a traveler would say them", () => {
  expect(windLabel(cond())).toEqual({ main: "NNE 15", sub: "gusts 25 kt" });
  expect(windLabel(cond({ gustKt: null }))).toEqual({ main: "NNE 15", sub: "kt, no gusts" });
  expect(windLabel(cond({ windDirName: null }))).toEqual({ main: "Variable 15", sub: "gusts 25 kt" });
  expect(windLabel(null)).toEqual({ main: "—", sub: null });
  expect(visLabel(37.7)).toBe("10+");
  expect(visLabel(6)).toBe("6");
  expect(visLabel(null)).toBe("—");
  expect(ceilingLabel(cond())).toEqual({ main: "5,000", sub: "ft · VFR" });
  expect(ceilingLabel(cond({ ceilingFt: null, source: "Forecast", flightCategory: null }))).toEqual({ main: "—", sub: "not forecast" });
  expect(ceilingLabel(cond({ ceilingFt: null, flightCategory: "VFR" }))).toEqual({ main: "None", sub: "VFR" });
  expect(skyLabel(cond())).toEqual({ main: "Overcast", sub: "no rain" });
  expect(skyLabel(cond({ precipMmHr: 2.46 }))).toEqual({ main: "Overcast", sub: "2.5 mm/h" });
  expect(shortDay("Wed, Sep 23")).toBe("Wed");
  expect(levelForGust(24)).toBe("good");
  expect(levelForGust(25)).toBe("watch");
  expect(levelForGust(35)).toBe("risk");
});

const H3 = 3 * 3_600_000;
const START = Date.parse("2026-09-23T13:00:00Z"); // Wed 9 AM in New York
const points = Array.from({ length: 24 }, (_, i) => ({ t: new Date(START + i * H3).toISOString(), windKt: 12 + (i % 4), gustKt: 20 + (i % 10) }));

test("chart geometry stays inside its box and puts the flight where it belongs in time", () => {
  const g = buildChart(points, new Date(START + 12 * H3).toISOString(), "America/New_York", 300, 120)!;
  expect(g).not.toBeNull();
  expect(g.yMax).toBeGreaterThanOrEqual(30);
  expect(g.gustSegments).toHaveLength(23);
  for (const s of g.gustSegments) {
    for (const v of [s.x1, s.x2]) expect(v >= 0 && v <= 300).toBe(true);
    for (const v of [s.y1, s.y2]) expect(v >= 18 && v <= g.baselineY).toBe(true);
  }
  // Halfway through the range in time is halfway across the chart (points are evenly spaced).
  expect(g.focusX).toBeCloseTo((12 / 23) * 300, 0);
  // Higher wind is higher on screen (smaller y).
  expect(g.gustSegments[0].y1).toBeLessThan(g.baselineY);
  expect(g.thresholdY).toBeLessThan(g.baselineY);
});

test("gust segments are colored by the airport thresholds", () => {
  const g = buildChart([
    { t: new Date(START).toISOString(), windKt: 10, gustKt: 20 },
    { t: new Date(START + H3).toISOString(), windKt: 12, gustKt: 27 },
    { t: new Date(START + 2 * H3).toISOString(), windKt: 20, gustKt: 38 },
    { t: new Date(START + 3 * H3).toISOString(), windKt: 10, gustKt: 12 },
  ], new Date(START).toISOString(), "UTC", 300, 120)!;
  expect(g.gustSegments.map((s) => s.level)).toEqual(["watch", "risk", "risk"]);
});

test("a weekday label is placed at each new local day, in the airport's timezone", () => {
  const g = buildChart(points, new Date(START).toISOString(), "America/New_York", 300, 120)!;
  const labels = g.ticks.map((t) => t.label);
  expect(labels[0]).toBe("Wed");
  expect(labels).toEqual(expect.arrayContaining(["Thu", "Fri"]));
  expect(new Set(labels).size).toBe(labels.length); // one label per day
  for (let i = 1; i < g.ticks.length; i++) expect(g.ticks[i].x).toBeGreaterThan(g.ticks[i - 1].x);
});

test("a weekday label that would crowd the next one is dropped, keeping the later day", () => {
  // Starts 9 PM Wednesday in New York: Thursday begins 3 hours (one bin) later, right next to the first point.
  const late = Array.from({ length: 24 }, (_, i) => ({ t: new Date(Date.parse("2026-09-24T01:00:00Z") + i * H3).toISOString(), windKt: 10, gustKt: 15 }));
  const g = buildChart(late, late[0].t, "America/New_York", 300, 120)!;
  const labels = g.ticks.map((t) => t.label);
  expect(labels[0]).toBe("Thu");
  expect(labels).not.toContain("Wed");
  for (let i = 1; i < g.ticks.length; i++) expect(g.ticks[i].x - g.ticks[i - 1].x).toBeGreaterThanOrEqual(38);
});

test("a flight outside the plotted range has no marker, and too little data draws nothing", () => {
  expect(buildChart(points, "2026-12-01T00:00:00Z", "UTC", 300, 120)!.focusX).toBeNull();
  expect(buildChart(points.slice(0, 2), points[0].t, "UTC", 300, 120)).toBeNull();
  expect(buildChart(points, points[0].t, "UTC", 0, 120)).toBeNull();
});
