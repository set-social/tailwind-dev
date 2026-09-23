import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { assessAirport, compass, detectNortheasterlyRun, inNortheastCoast, type AssessInput } from "./wx-assess.ts";
import { ceilingOf, flightCategory, parseMetar, parseNwsAlerts, parseOpenMeteo, parseTaf, tafAt, type HourPoint } from "./wx-parse.ts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-23T17:15:00Z"); // Wednesday afternoon
const START = Date.parse("2026-09-23T00:00:00Z");

/** Hourly points from a function of the hour index (0 = Wed 00:00 UTC). */
function series(fn: (h: number) => Partial<HourPoint>, hours = 96): HourPoint[] {
  return Array.from({ length: hours }, (_, h) => ({
    ms: START + h * HOUR, windKt: 8, gustKt: 12, dirDeg: 270, precipMm: 0, visMi: 15, tempC: 18, code: 3, pressureHpa: 1015, ...fn(h),
  }));
}

/** A northeasterly setup that runs through Friday evening, then swings north and eases (the shape of the real EWR forecast). */
const NE_SETUP = series((h) => (h < 66
  ? { dirDeg: 20 + (h % 5) * 8, windKt: 13 + (h % 4), gustKt: 22 + (h % 7) }
  : { dirDeg: 350, windKt: 8, gustKt: 16 }));

const base = (over: Partial<AssessInput> = {}): AssessInput => ({
  airport: "EWR", role: "arrival", timezone: "America/New_York", focusIso: "2026-09-24T22:53:00Z", focusVerb: "Arrives",
  nowMs: NOW, lat: 40.69, lon: -74.17, series: NE_SETUP, metar: null, taf: null, alerts: [], ...over,
});

// ── parsers, on shapes copied from the live feeds ────────────────────────

Deno.test("flight category follows the FAA thresholds", () => {
  assertEquals(flightCategory(5000, 10), "VFR");
  assertEquals(flightCategory(2500, 10), "MVFR");
  assertEquals(flightCategory(null, 4), "MVFR");
  assertEquals(flightCategory(900, 10), "IFR");
  assertEquals(flightCategory(5000, 2), "IFR");
  assertEquals(flightCategory(400, 10), "LIFR");
  assertEquals(flightCategory(5000, 0.5), "LIFR");
  assertEquals(flightCategory(null, null), null);
});

Deno.test("only broken/overcast layers count as a ceiling", () => {
  assertEquals(ceilingOf([{ cover: "SCT", base: 2500 }, { cover: "BKN", base: 18000 }, { cover: "OVC", base: 25000 }]), 18000);
  assertEquals(ceilingOf([{ cover: "FEW", base: 800 }]), null);
  assertEquals(ceilingOf([]), null);
  assertEquals(ceilingOf(undefined), null);
});

const TAF_JSON = [{
  icaoId: "KEWR", issueTime: "2026-09-23T14:37:00.000Z",
  fcsts: [
    { timeFrom: 1790175600, timeTo: 1790211600, fcstChange: null, wdir: 50, wspd: 17, wgst: 28, visib: "6+", wxString: null, clouds: [{ cover: "SCT", base: 2500 }, { cover: "BKN", base: 18000 }] },
    { timeFrom: 1790211600, timeTo: 1790251200, fcstChange: "FM", wdir: 30, wspd: 13, wgst: 23, visib: "6+", wxString: null, clouds: [{ cover: "SCT", base: 5000 }] },
    { timeFrom: 1790230000, timeTo: 1790240000, fcstChange: "TEMPO", wdir: null, wspd: null, wgst: null, visib: "2", wxString: "-RA", clouds: [{ cover: "BKN", base: 800 }] },
  ],
}];

Deno.test("parseTaf reads base periods and TEMPO groups (null fields mean unchanged)", () => {
  const taf = parseTaf(TAF_JSON)!;
  assertEquals(taf.icao, "KEWR");
  assertEquals(taf.periods.length, 3);
  assertEquals(taf.periods[0].windKt, 17);
  assertEquals(taf.periods[0].gustKt, 28);
  assertEquals(taf.periods[0].visMi, 6);
  assertEquals(taf.periods[2].change, "TEMPO");
  assertEquals(taf.periods[2].windKt, null);
  assertEquals(taf.periods[2].ceilingFt, 800);
  assertEquals(parseTaf([]), null);
  assertEquals(parseTaf(null), null);
});

Deno.test("tafAt picks the base forecast in force and any overlapping TEMPO", () => {
  const taf = parseTaf(TAF_JSON)!;
  const early = tafAt(taf, 1790180000 * 1000);
  assertEquals(early.base?.windKt, 17);
  assertEquals(early.tempos.length, 0);
  const late = tafAt(taf, 1790235000 * 1000);
  assertEquals(late.base?.windKt, 13); // the FM group replaced the first
  assertEquals(late.tempos.length, 1);
  assertEquals(tafAt(taf, 1790999999 * 1000).base, null); // past the TAF
});

Deno.test("parseMetar handles gusts, variable wind and missing clouds", () => {
  const m = parseMetar([{ icaoId: "KEWR", obsTime: 1790182260, temp: 18.9, wdir: 40, wspd: 18, wgst: 26, visib: "10+", fltCat: "VFR", clouds: [{ cover: "BKN", base: 3600 }] }])!;
  assertEquals([m.dirDeg, m.windKt, m.gustKt, m.visMi, m.ceilingFt, m.category], [40, 18, 26, 10, 3600, "VFR"]);
  const v = parseMetar([{ icaoId: "KXNA", obsTime: 1790182380, wdir: "VRB", wspd: 4, wgst: null, visib: "10+", clouds: [] }])!;
  assertEquals(v.dirDeg, null);
  assertEquals(v.gustKt, null);
  assertEquals(parseMetar([]), null);
});

Deno.test("parseOpenMeteo converts visibility to miles and never lets a gust fall below the wind", () => {
  const pts = parseOpenMeteo({ hourly: { time: ["2026-09-23T00:00"], wind_speed_10m: [14], wind_gusts_10m: [9], wind_direction_10m: [45], precipitation: [0.4], visibility: [16093.44], temperature_2m: [12], weather_code: [61], pressure_msl: [1010] } });
  assertEquals(pts.length, 1);
  assertEquals(pts[0].visMi, 10);
  assertEquals(pts[0].gustKt, 14);
  assertEquals(pts[0].ms, Date.parse("2026-09-23T00:00:00Z"));
  assertEquals(parseOpenMeteo({}), []);
});

Deno.test("parseNwsAlerts orders by severity, drops tests, truncates free text", () => {
  const alerts = parseNwsAlerts({ features: [
    { properties: { event: "Wind Advisory", severity: "Minor", headline: "Wind Advisory until 8 PM", status: "Actual", description: "x".repeat(2000) } },
    { properties: { event: "High Wind Warning", severity: "Severe", headline: "High Wind Warning", status: "Actual", ends: "2026-09-25T00:00:00Z" } },
    { properties: { event: "Test", severity: "Extreme", status: "Test" } },
  ] });
  assertEquals(alerts.map((a) => a.event), ["High Wind Warning", "Wind Advisory"]);
  assertEquals(alerts[1].description.length, 600);
});

// ── the engine ───────────────────────────────────────────────────────────

Deno.test("compass names", () => {
  assertEquals(compass(40), "NE");
  assertEquals(compass(350), "N");
  assertEquals(compass(0), "N");
  assertEquals(compass(null), null);
});

Deno.test("gusty northeasterly wind at the arrival airport is a watch, with real numbers and local time", () => {
  const a = assessAirport(base());
  assertEquals(a.airport, "EWR");
  assertEquals(a.level, "watch");
  const wind = a.factors.find((f) => f.id === "wind")!;
  assertEquals(wind.level, "watch");
  assertStringIncludes(wind.title.toLowerCase(), "northeast");
  assertStringIncludes(wind.detail, "6:53 PM EDT"); // 22:53Z in New York, not UTC
  assertStringIncludes(wind.detail, "kt");
  assertEquals(a.focusLabel, "Arrives 6:53 PM EDT");
});

Deno.test("persistent northeast wind is flagged as a pattern, but only called nor'easter-type when gusts reach 30 kt", () => {
  const a = assessAirport(base());
  const p = a.factors.find((f) => f.id === "pattern")!;
  assert(p, "pattern factor present");
  assertEquals(p.title, "Prolonged gusty northeast wind"); // peak gust here is 28 kt: honest, not dramatic
  assertStringIncludes(p.detail, "gusts up to 28 kt");
  assertStringIncludes(p.detail, "not a National Weather Service declaration");

  const strong = series((h) => (h < 66 ? { dirDeg: 40, windKt: 20, gustKt: 33 } : { dirDeg: 350, windKt: 8, gustKt: 16 }));
  const s = assessAirport(base({ series: strong })).factors.find((f) => f.id === "pattern")!;
  assertEquals(s.title, "Nor'easter-type wind pattern");
  assertStringIncludes(s.detail, "gusts up to 33 kt");
});

Deno.test("no pattern away from the coast, or when the wind isn't onshore northeasterly", () => {
  assertFalse(assessAirport(base({ airport: "XNA", lat: 36.28, lon: -94.31, timezone: "America/Chicago" })).factors.some((f) => f.id === "pattern"));
  const west = series(() => ({ dirDeg: 270, windKt: 20, gustKt: 32 }));
  assertFalse(assessAirport(base({ series: west })).factors.some((f) => f.id === "pattern"));
});

Deno.test("a short northeasterly blow is not a pattern; a gap of two hours is bridged", () => {
  const blow = (on: (h: number) => boolean) => series((h) => (on(h) ? { dirDeg: 40, windKt: 20, gustKt: 30 } : { dirDeg: 200, windKt: 6, gustKt: 8 }));
  assertEquals(detectNortheasterlyRun(blow((h) => h >= 30 && h < 38)), null); // 8 h
  assert(detectNortheasterlyRun(blow((h) => h >= 30 && h < 44)));               // 14 h
  assert(detectNortheasterlyRun(blow((h) => (h >= 30 && h < 38) || (h >= 40 && h < 48)))); // 2 h gap bridged
  assertEquals(detectNortheasterlyRun(blow((h) => (h >= 30 && h < 36) || (h >= 40 && h < 46))), null); // 4 h gap is not
  assert(inNortheastCoast(40.69, -74.17));
  assertFalse(inNortheastCoast(36.28, -94.31));
});

Deno.test("calm weather at the departure airport is good, with no invented concerns", () => {
  const calm = series(() => ({ dirDeg: 50, windKt: 5, gustKt: 8, visMi: 10, precipMm: 0 }));
  const a = assessAirport(base({ airport: "XNA", role: "departure", timezone: "America/Chicago", lat: 36.28, lon: -94.31, focusIso: "2026-09-24T19:53:00Z", focusVerb: "Departs", series: calm }));
  assertEquals(a.level, "good");
  assertEquals(a.factors.find((f) => f.id === "wind")!.level, "good");
  assertEquals(a.factors.find((f) => f.id === "precipitation")!.title, "No precipitation expected");
  assertFalse(a.factors.some((f) => f.id === "pattern" || f.id === "alert" || f.id === "icing"));
  assertEquals(a.focusLabel, "Departs 2:53 PM CDT");
});

Deno.test("when the TAF covers the flight time, its wind and category are used and labelled as TAF", () => {
  const taf = parseTaf(TAF_JSON)!;
  // 1790220000 s = inside the FM group (wdir 30, 13 kt, gust 23)
  const a = assessAirport(base({ taf, focusIso: new Date(1790220000 * 1000).toISOString() }));
  assertEquals(a.conditions?.source, "TAF");
  assertEquals(a.conditions?.gustKt, 23);
  assertEquals(a.conditions?.flightCategory, "VFR");
  assert(a.sources.some((s) => s.startsWith("TAF KEWR")));
});

Deno.test("a TEMPO group that drops conditions to IFR raises the visibility factor, and says it's temporary", () => {
  const taf = parseTaf(TAF_JSON)!;
  const a = assessAirport(base({ taf, focusIso: new Date(1790235000 * 1000).toISOString() }));
  const v = a.factors.find((f) => f.id === "visibility")!;
  assertEquals(v.level, "watch");
  assertStringIncludes(v.detail, "Temporarily IFR");
  assertStringIncludes(v.detail, "TEMPO");
});

Deno.test("an observed METAR near the focus time is used as the conditions, and shown as 'now'", () => {
  const metar = parseMetar([{ icaoId: "KEWR", obsTime: Math.floor(NOW / 1000), wdir: 40, wspd: 18, wgst: 26, visib: "10+", fltCat: "VFR", clouds: [{ cover: "BKN", base: 3600 }] }])!;
  const a = assessAirport(base({ metar, focusIso: new Date(NOW + 30 * 60_000).toISOString() }));
  assertEquals(a.conditions?.source, "METAR");
  assertEquals(a.observedNow?.windKt, 18);
  assertEquals(a.observedNow?.gustKt, 26);
});

Deno.test("thunderstorms are a risk; cold precipitation adds a de-icing note", () => {
  const stormy = series((h) => (h >= 40 && h <= 48 ? { code: 95, precipMm: 6 } : {}));
  const t = assessAirport(base({ series: stormy, focusIso: new Date(START + 44 * HOUR).toISOString() }));
  assertEquals(t.factors.find((f) => f.id === "precipitation")!.level, "risk");
  assertEquals(t.level, "risk");

  const icy = series(() => ({ tempC: -1, precipMm: 1, code: 71 }));
  const i = assessAirport(base({ series: icy }));
  assertEquals(i.factors.find((f) => f.id === "icing")!.level, "watch");
  assertEquals(i.factors.find((f) => f.id === "precipitation")!.title, "Snow or freezing precipitation");
});

Deno.test("very strong gusts are a risk", () => {
  const a = assessAirport(base({ series: series(() => ({ dirDeg: 250, windKt: 26, gustKt: 41 })) }));
  assertEquals(a.factors.find((f) => f.id === "wind")!.level, "risk");
  assertEquals(a.level, "risk");
});

Deno.test("an NWS alert is a factor only when it overlaps the flight, and severe means risk", () => {
  const active = { event: "High Wind Warning", severity: "Severe", headline: "High Wind Warning in effect", onsetIso: "2026-09-24T12:00:00Z", endsIso: "2026-09-25T06:00:00Z", description: "" };
  const expired = { ...active, event: "Old", onsetIso: "2026-09-20T00:00:00Z", endsIso: "2026-09-21T00:00:00Z" };
  const a = assessAirport(base({ alerts: [active, expired] }));
  const alerts = a.factors.filter((f) => f.id === "alert");
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].level, "risk");
  assertStringIncludes(alerts[0].detail, "National Weather Service");
  assertEquals(a.level, "risk");
});

Deno.test("no source covering the flight: not available, no findings, no invented level", () => {
  const a = assessAirport(base({ series: null, taf: null, metar: null }));
  assertEquals(a.dataAvailable, false);
  assertEquals(a.factors, []);
  assertEquals(a.conditions, null);
  const farOut = assessAirport(base({ focusIso: "2026-10-30T22:53:00Z" }));
  assertEquals(farOut.dataAvailable, false);
});

Deno.test("the daily outlook groups by the airport's local day and shows the wind easing", () => {
  const a = assessAirport(base());
  assert(a.daily.length >= 3);
  const peaks = a.daily.map((d) => d.peakGustKt);
  assert(peaks[0] >= 22, "early days are gusty");
  assert(a.daily[a.daily.length - 1].peakGustKt <= 16, "later days ease");
  assertEquals(a.daily[0].dominantDir !== null, true);
});

Deno.test("the chart is 3-hourly around the flight and never invents points outside the data", () => {
  const a = assessAirport(base());
  assert(a.chart.length > 10 && a.chart.length <= 25);
  for (let i = 1; i < a.chart.length; i++) assertEquals(Date.parse(a.chart[i].t) - Date.parse(a.chart[i - 1].t), 3 * HOUR);
  assert(a.chart.every((p) => p.gustKt >= p.windKt));
  assert(Date.parse(a.chart[0].t) >= START);
});

Deno.test("a building trend after the flight and an easing trend are described from real averages", () => {
  const easing = assessAirport(base({ series: series((h) => ({ dirDeg: 250, windKt: 15, gustKt: h < 46 ? 30 : 18 })), focusIso: new Date(START + 46 * HOUR).toISOString() }));
  const t = easing.factors.find((f) => f.id === "trend")!;
  assertEquals(t.title, "Wind is easing");
  assertStringIncludes(t.detail, "30 kt");
  assertStringIncludes(t.detail, "18 kt");
});
