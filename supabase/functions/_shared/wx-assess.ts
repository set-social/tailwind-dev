// The deterministic weather engine. Given the raw ingredients for one airport
// and one moment (a flight's departure, arrival, or its aircraft's earlier
// departure), it produces plain-language FINDINGS with the real numbers and
// times already in them.
//
// This is the "Claude narrates, code decides" line from the roadmap: every
// threshold, comparison and number lives here, in code that can be read and
// unit-tested. The model that writes the traveler-facing explanation
// (wx-narrative.ts) only ever sees these findings and may not add numbers.
//
// Thresholds (knots / miles / feet), chosen to flag conditions that commonly
// slow or complicate operations, not to predict a delay:
//   wind        watch: gust >= 25 or sustained >= 20      risk: gust >= 35 or sustained >= 28
//   visibility  watch: < 3 mi or ceiling < 1,000 ft (IFR) risk: < 1 mi or ceiling < 500 ft (LIFR)
//   precip      watch: >= 2.5 mm/h, snow or freezing      risk: >= 7.6 mm/h or thunderstorms
//   icing       watch: <= 2 C with precipitation

import { conditionFromWmo } from "./weather.ts";
import {
  CATEGORY_RANK, flightCategory, tafAt, type HourPoint, type MetarObs, type TafData, type TafPeriod,
} from "./wx-parse.ts";
import type {
  AirportWeatherAssessment, FlightCategory, WxAlert, WxConditions, WxDay, WxFactor, WxLevel,
} from "./types.ts";

const HOUR = 3_600_000;

// ─── formatting (all in the airport's own timezone) ──────────────────────

const tzOpt = (tz: string | null) => (tz ? { timeZone: tz } : {});

// Newer ICU builds put a narrow no-break space (U+202F) before AM/PM; a plain space renders identically everywhere.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

export function fmtTime(ms: number, tz: string | null): string {
  try {
    return plain(new Intl.DateTimeFormat("en-US", { ...tzOpt(tz), hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** "Fri 3 PM" */
export function fmtDayHour(ms: number, tz: string | null): string {
  try {
    return plain(new Intl.DateTimeFormat("en-US", { ...tzOpt(tz), weekday: "short", hour: "numeric" }).format(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

const fmtHour = (ms: number, tz: string | null): string => {
  try {
    return plain(new Intl.DateTimeFormat("en-US", { ...tzOpt(tz), hour: "numeric" }).format(ms));
  } catch {
    return String(ms);
  }
};

function dayKey(ms: number, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { ...tzOpt(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function dayLabel(ms: number, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...tzOpt(tz), weekday: "short", month: "short", day: "numeric" }).format(ms);
  } catch {
    return dayKey(ms, tz);
  }
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg: number | null): string | null => (deg === null ? null : COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]);

const WORDS: Record<string, string> = {
  N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast",
  SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest",
  NW: "northwest", NNW: "north-northwest",
};
const dirWord = (deg: number | null): string => (deg === null ? "variable" : WORDS[compass(deg)!]);

const r0 = (n: number) => Math.round(n);
const maxLevel = (levels: WxLevel[]): WxLevel => (levels.includes("risk") ? "risk" : levels.includes("watch") ? "watch" : "good");

// ─── input ───────────────────────────────────────────────────────────────

export interface AssessInput {
  airport: string;
  role: AirportWeatherAssessment["role"];
  timezone: string | null;
  focusIso: string;
  /** "Departs" | "Arrives" | "Aircraft departs" — used for the label and the wording. */
  focusVerb: string;
  nowMs: number;
  lat: number | null;
  lon: number | null;
  series: HourPoint[] | null;
  metar: MetarObs | null;
  taf: TafData | null;
  alerts: WxAlert[];
}

const nearestHour = (series: HourPoint[], ms: number, maxGap = 90 * 60_000): HourPoint | null => {
  let best: HourPoint | null = null;
  let bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(p.ms - ms);
    if (gap < bestGap) { bestGap = gap; best = p; }
  }
  return best && bestGap <= maxGap ? best : null;
};

const withinWindow = (series: HourPoint[], centre: number, halfHours: number) =>
  series.filter((p) => Math.abs(p.ms - centre) <= halfHours * HOUR);

// ─── conditions at a moment ──────────────────────────────────────────────

function summarizeWx(wx: string | null, code: number | null, ceilingFt: number | null): string {
  if (code !== null) return conditionFromWmo(code).summary;
  if (wx) {
    if (/TS/.test(wx)) return "Thunderstorms";
    if (/SN|SG|PL/.test(wx)) return "Snow";
    if (/FZ/.test(wx)) return "Freezing precipitation";
    if (/RA|SH/.test(wx)) return "Rain";
    if (/DZ/.test(wx)) return "Drizzle";
    if (/FG/.test(wx)) return "Fog";
    if (/BR|HZ/.test(wx)) return "Mist";
  }
  return ceilingFt === null ? "Few or scattered clouds" : ceilingFt < 1000 ? "Low overcast" : "Cloudy";
}

function conditionsAt(i: AssessInput, ms: number): WxConditions | null {
  const om = i.series ? nearestHour(i.series, ms) : null;
  const { base } = tafAt(i.taf, ms);
  const metar = i.metar && Math.abs(i.metar.obsMs - ms) <= 90 * 60_000 ? i.metar : null;

  if (metar) {
    return {
      atIso: new Date(metar.obsMs).toISOString(), atLocal: fmtTime(metar.obsMs, i.timezone), source: "METAR",
      windDirDeg: metar.dirDeg, windDirName: compass(metar.dirDeg), windKt: metar.windKt, gustKt: metar.gustKt,
      visibilityMi: metar.visMi, ceilingFt: metar.ceilingFt, flightCategory: metar.category,
      precipMmHr: om?.precipMm ?? null, tempC: metar.tempC ?? om?.tempC ?? null, summary: summarizeWx(metar.wx, om?.code ?? null, metar.ceilingFt),
    };
  }
  if (base) {
    const cat = flightCategory(base.ceilingFt, base.visMi);
    return {
      atIso: new Date(ms).toISOString(), atLocal: fmtTime(ms, i.timezone), source: "TAF",
      windDirDeg: base.dirDeg, windDirName: compass(base.dirDeg), windKt: base.windKt, gustKt: base.gustKt,
      visibilityMi: base.visMi, ceilingFt: base.ceilingFt, flightCategory: cat,
      precipMmHr: om?.precipMm ?? null, tempC: om?.tempC ?? null, summary: summarizeWx(base.wx, om?.code ?? null, base.ceilingFt),
    };
  }
  if (om) {
    return {
      atIso: new Date(om.ms).toISOString(), atLocal: fmtTime(om.ms, i.timezone), source: "Forecast",
      windDirDeg: om.dirDeg, windDirName: compass(om.dirDeg), windKt: r0(om.windKt), gustKt: r0(om.gustKt),
      visibilityMi: om.visMi, ceilingFt: null, flightCategory: null,
      precipMmHr: om.precipMm, tempC: om.tempC, summary: summarizeWx(null, om.code, null),
    };
  }
  return null;
}

// ─── findings ────────────────────────────────────────────────────────────

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const FROZEN_CODES = new Set([56, 57, 66, 67, 71, 73, 75, 77, 85, 86]);

interface Peak { gust: number; gustMs: number; wind: number }

function windPeak(i: AssessInput, F: number): Peak | null {
  const pts = i.series ? withinWindow(i.series, F, 2) : [];
  let gust = -1, gustMs = F, wind = -1;
  for (const p of pts) {
    if (p.gustKt > gust) { gust = p.gustKt; gustMs = p.ms; }
    wind = Math.max(wind, p.windKt);
  }
  // Aviation forecasts (TAF) can carry a stronger gust than the hourly model.
  for (const t of i.taf?.periods ?? []) {
    if (t.toMs <= F - 2 * HOUR || t.fromMs >= F + 2 * HOUR) continue;
    if (t.change === "PROB" && (t.probability ?? 100) < 40) continue;
    if (t.gustKt !== null && t.gustKt > gust) { gust = t.gustKt; gustMs = Math.min(Math.max(t.fromMs, F - 2 * HOUR), F + 2 * HOUR); }
    if (t.windKt !== null) wind = Math.max(wind, t.windKt);
  }
  return gust < 0 ? null : { gust: r0(gust), gustMs, wind: r0(Math.max(wind, 0)) };
}

function windFactor(i: AssessInput, F: number, c: WxConditions | null, peak: Peak | null): WxFactor | null {
  if (!c && !peak) return null;
  const sustained = Math.max(c?.windKt ?? 0, peak?.wind ?? 0);
  const gust = Math.max(c?.gustKt ?? 0, peak?.gust ?? 0);
  const level: WxLevel = gust >= 35 || sustained >= 28 ? "risk" : gust >= 25 || sustained >= 20 ? "watch" : "good";
  const dir = c?.windDirDeg ?? null;
  const word = dirWord(dir);

  let title: string;
  if (level === "good") title = "Wind is manageable";
  else if (gust - sustained >= 8) title = level === "risk" ? `Very gusty ${word} wind` : `Gusty ${word} wind`;
  else title = level === "risk" ? `Very strong ${word} wind` : `Strong ${word} wind`;

  const at = c
    ? `${c.windDirName ? `${c.windDirName} ` : ""}${c.windKt !== null ? `${r0(c.windKt)} kt` : "wind"}${c.gustKt ? ` gusting ${r0(c.gustKt)} kt` : ""} around ${fmtTime(F, i.timezone)} (${c.source})`
    : `up to ${gust} kt around ${fmtTime(F, i.timezone)}`;
  let detail = `${at.charAt(0).toUpperCase()}${at.slice(1)}.`;
  if (peak && peak.gust > (c?.gustKt ?? 0) + 2) {
    detail += ` Gusts reach ${peak.gust} kt around ${fmtTime(peak.gustMs, i.timezone)} in the hours around your flight.`;
  }
  return { id: "wind", level, title, detail };
}

function visibilityFactor(i: AssessInput, F: number, c: WxConditions | null): WxFactor | null {
  if (!c || (c.visibilityMi === null && c.ceilingFt === null)) return null;
  const cat = c.flightCategory;
  let level: WxLevel = cat === "LIFR" ? "risk" : cat === "IFR" ? "watch" : "good";

  // A TEMPO/PROB group can drop conditions for a while even when the base forecast is fine.
  const { tempos } = tafAt(i.taf, F);
  let temp: { p: TafPeriod; cat: FlightCategory } | null = null;
  for (const p of tempos) {
    if (p.change === "PROB" && (p.probability ?? 100) < 40) continue;
    const tc = flightCategory(p.ceilingFt, p.visMi);
    if (tc && CATEGORY_RANK[tc] > CATEGORY_RANK[cat ?? "VFR"] && CATEGORY_RANK[tc] >= 2 && (!temp || CATEGORY_RANK[tc] > CATEGORY_RANK[temp.cat])) temp = { p, cat: tc };
  }
  if (temp) level = maxLevel([level, temp.cat === "LIFR" ? "risk" : "watch"]);

  const bits: string[] = [];
  if (c.visibilityMi !== null) bits.push(`visibility ${c.visibilityMi >= 10 ? "10+" : c.visibilityMi} mi`);
  if (c.ceilingFt !== null) bits.push(`ceiling ${c.ceilingFt.toLocaleString("en-US")} ft`);
  let detail = `${bits.join(", ").replace(/^./, (s) => s.toUpperCase())}${cat ? ` (${cat})` : ""} around ${fmtTime(F, i.timezone)}.`;
  if (temp) detail += ` Temporarily ${temp.cat} between ${fmtTime(temp.p.fromMs, i.timezone)} and ${fmtTime(temp.p.toMs, i.timezone)} is possible (${temp.p.change}).`;

  const title = level === "good" ? "Clear visibility" : level === "risk" ? "Very low visibility or ceiling" : `Reduced visibility or low ceiling`;
  return { id: "visibility", level, title, detail };
}

function precipFactor(i: AssessInput, F: number, c: WxConditions | null): WxFactor | null {
  const pts = i.series ? withinWindow(i.series, F, 2) : [];
  if (!pts.length && (c?.precipMmHr ?? null) === null) return null;
  const peakMm = Math.max(0, ...pts.map((p) => p.precipMm), c?.precipMmHr ?? 0);
  const worst = pts.reduce<HourPoint | null>((w, p) => (!w || p.precipMm > w.precipMm || (p.code !== null && p.code >= 95)) ? p : w, null);
  const thunder = pts.some((p) => p.code !== null && p.code >= 95) || /TS/.test(i.metar?.wx ?? "") || (i.taf?.periods ?? []).some((p) => /TS/.test(p.wx ?? "") && p.fromMs < F + 2 * HOUR && p.toMs > F - 2 * HOUR);
  const frozen = pts.some((p) => p.code !== null && FROZEN_CODES.has(p.code) && p.precipMm > 0);
  const raining = pts.some((p) => p.code !== null && RAIN_CODES.has(p.code)) || peakMm > 0.1;

  if (thunder) {
    return { id: "precipitation", level: "risk", title: "Thunderstorms possible", detail: `Thunderstorms appear in the forecast near ${fmtTime(F, i.timezone)}.` };
  }
  if (frozen) {
    return { id: "precipitation", level: peakMm >= 2.5 ? "risk" : "watch", title: "Snow or freezing precipitation", detail: `Frozen precipitation is forecast near ${fmtTime(F, i.timezone)}${peakMm > 0 ? `, up to ${peakMm.toFixed(1)} mm/h` : ""}.` };
  }
  if (peakMm >= 7.6) return { id: "precipitation", level: "risk", title: "Heavy rain", detail: `Rain up to ${peakMm.toFixed(1)} mm/h near ${fmtTime(worst?.ms ?? F, i.timezone)}.` };
  if (peakMm >= 2.5) return { id: "precipitation", level: "watch", title: "Steady rain", detail: `Rain up to ${peakMm.toFixed(1)} mm/h near ${fmtTime(worst?.ms ?? F, i.timezone)}.` };
  if (raining) return { id: "precipitation", level: "good", title: "Light rain possible", detail: `Light rain, up to ${peakMm.toFixed(1)} mm/h, around your flight.` };
  return { id: "precipitation", level: "good", title: "No precipitation expected", detail: "None forecast in the hours around your flight." };
}

function icingFactor(i: AssessInput, F: number, c: WxConditions | null): WxFactor | null {
  const pts = i.series ? withinWindow(i.series, F, 2) : [];
  const cold = pts.filter((p) => p.tempC !== null && p.tempC <= 2 && (p.precipMm > 0 || (p.code !== null && FROZEN_CODES.has(p.code))));
  if (!cold.length) return null;
  const t = Math.min(...cold.map((p) => p.tempC as number));
  return { id: "icing", level: "watch", title: "Cold with precipitation", detail: `Temperatures near ${r0(t)} C with precipitation around your flight can mean de-icing and longer taxi times.` };
}

const ALERT_LEVEL = (sev: string): WxLevel => (sev === "Extreme" || sev === "Severe" ? "risk" : sev === "Moderate" ? "watch" : "neutral");

function alertFactors(i: AssessInput, F: number): WxFactor[] {
  return i.alerts
    .filter((a) => {
      const start = a.onsetIso ? Date.parse(a.onsetIso) : -Infinity;
      const end = a.endsIso ? Date.parse(a.endsIso) : Infinity;
      return start <= F + 3 * HOUR && end >= F - 3 * HOUR;
    })
    .slice(0, 3)
    .map((a) => ({
      id: "alert" as const,
      level: ALERT_LEVEL(a.severity),
      title: a.event,
      detail: `National Weather Service: ${a.headline}${a.endsIso ? ` (until ${fmtDayHour(Date.parse(a.endsIso), i.timezone)})` : ""}.`,
    }));
}

// ─── nor'easter-type pattern ─────────────────────────────────────────────

export interface WindRun { startMs: number; endMs: number; peakGust: number; peakGustMs: number; avgDir: number }

/** Mid-Atlantic to New England coast, where sustained onshore northeasterlies are the signature of a nor'easter. */
export const inNortheastCoast = (lat: number | null, lon: number | null) =>
  lat !== null && lon !== null && lat >= 36 && lat <= 46.5 && lon >= -76.5 && lon <= -66;

/**
 * The longest stretch (gaps up to 2 h bridged) of persistent onshore
 * northeasterly flow (from 10 to 100 degrees with gusts >= 20 kt or sustained
 * >= 15 kt), lasting at least `minHours` and peaking at gusts >= 25 kt. The
 * bar for "persistent" is 20 kt because real forecasts hover in the low 20s
 * with occasional higher gusts; requiring 25 kt every hour would miss them.
 * This is a pattern label derived from the forecast, NOT an NWS declaration —
 * the wording built on it says so, and only calls it a nor'easter-type setup
 * when the peak gust reaches 30 kt.
 */
export function detectNortheasterlyRun(series: HourPoint[], minHours = 12): WindRun | null {
  const hit = (p: HourPoint) => p.dirDeg !== null && p.dirDeg >= 10 && p.dirDeg <= 100 && (p.gustKt >= 20 || p.windKt >= 15);
  const runs: { pts: HourPoint[] }[] = [];
  let cur: HourPoint[] = [];
  let gap = 0;
  for (const p of series) {
    if (hit(p)) { cur.push(p); gap = 0; }
    else if (cur.length && ++gap <= 2) { cur.push(p); }
    else if (cur.length) {
      while (cur.length && !hit(cur[cur.length - 1])) cur.pop();
      if (cur.length) runs.push({ pts: cur });
      cur = []; gap = 0;
    }
  }
  while (cur.length && !hit(cur[cur.length - 1])) cur.pop();
  if (cur.length) runs.push({ pts: cur });

  let best: WindRun | null = null;
  for (const { pts } of runs) {
    const hours = (pts[pts.length - 1].ms - pts[0].ms) / HOUR + 1;
    if (hours < minHours) continue;
    const peak = pts.reduce((a, b) => (b.gustKt > a.gustKt ? b : a));
    if (peak.gustKt < 25) continue;
    const run: WindRun = {
      startMs: pts[0].ms, endMs: pts[pts.length - 1].ms, peakGust: r0(peak.gustKt), peakGustMs: peak.ms,
      avgDir: r0(pts.reduce((s, p) => s + (p.dirDeg ?? 0), 0) / pts.length),
    };
    if (!best || run.endMs - run.startMs > best.endMs - best.startMs) best = run;
  }
  return best;
}

function patternFactor(i: AssessInput, F: number): WxFactor | null {
  if (!i.series || !inNortheastCoast(i.lat, i.lon)) return null;
  const future = i.series.filter((p) => p.ms >= i.nowMs - HOUR);
  const run = detectNortheasterlyRun(future);
  // Only relevant if it overlaps the day around the flight.
  if (!run || run.endMs < F - 12 * HOUR || run.startMs > F + 12 * HOUR) return null;
  const from = run.startMs <= future[0].ms + HOUR ? "now" : fmtDayHour(run.startMs, i.timezone);
  return {
    id: "pattern",
    level: "watch",
    title: run.peakGust >= 30 ? "Nor'easter-type wind pattern" : "Prolonged gusty northeast wind",
    detail: `Onshore ${dirWord(run.avgDir)} winds with gusts up to ${run.peakGust} kt are forecast at ${i.airport} from ${from} through ${fmtDayHour(run.endMs, i.timezone)}. This is a pattern read from the forecast, not a National Weather Service declaration.`,
  };
}

function trendFactor(i: AssessInput, F: number): WxFactor | null {
  if (!i.series) return null;
  const mean = (pts: HourPoint[]) => (pts.length ? pts.reduce((s, p) => s + p.gustKt, 0) / pts.length : null);
  const before = mean(i.series.filter((p) => p.ms >= F - 6 * HOUR && p.ms < F));
  const after = mean(i.series.filter((p) => p.ms > F && p.ms <= F + 6 * HOUR));
  if (before === null || after === null || Math.max(before, after) < 15) return null;
  const diff = after - before;
  if (Math.abs(diff) < 5) return null;
  return {
    id: "trend", level: "neutral",
    title: diff < 0 ? "Wind is easing" : "Wind is building",
    detail: `Gusts average about ${r0(before)} kt in the 6 hours before ${fmtTime(F, i.timezone)} and about ${r0(after)} kt in the 6 hours after.`,
  };
}

// ─── outlook + chart ─────────────────────────────────────────────────────

function dailyOutlook(i: AssessInput, F: number): WxDay[] {
  if (!i.series) return [];
  const from = Math.max(i.series[0]?.ms ?? 0, F - 36 * HOUR);
  const to = F + 96 * HOUR;
  const days = new Map<string, HourPoint[]>();
  for (const p of i.series) {
    if (p.ms < from || p.ms > to) continue;
    const k = dayKey(p.ms, i.timezone);
    (days.get(k) ?? days.set(k, []).get(k)!).push(p);
  }
  return [...days.values()].slice(0, 6).map((pts) => {
    const peak = pts.reduce((a, b) => (b.gustKt > a.gustKt ? b : a));
    return {
      label: dayLabel(pts[0].ms, i.timezone),
      peakGustKt: r0(peak.gustKt),
      peakWindKt: r0(Math.max(...pts.map((p) => p.windKt))),
      peakGustLocal: fmtHour(peak.ms, i.timezone),
      dominantDir: compass(peak.dirDeg),
      precipMm: Math.round(pts.reduce((s, p) => s + p.precipMm, 0) * 10) / 10,
    };
  });
}

function chartSeries(i: AssessInput, F: number): AirportWeatherAssessment["chart"] {
  if (!i.series || !i.series.length) return [];
  const start = Math.max(i.series[0].ms, F - 24 * HOUR);
  const end = Math.min(i.series[i.series.length - 1].ms, F + 48 * HOUR);
  const out: AirportWeatherAssessment["chart"] = [];
  for (let s = start; s <= end; s += 3 * HOUR) {
    const bin = i.series.filter((p) => p.ms >= s && p.ms < s + 3 * HOUR);
    if (!bin.length) continue;
    out.push({
      t: new Date(s).toISOString(),
      windKt: r0(bin.reduce((a, p) => a + p.windKt, 0) / bin.length),
      gustKt: r0(Math.max(...bin.map((p) => p.gustKt))),
    });
  }
  return out;
}

// ─── entry point ─────────────────────────────────────────────────────────

export function assessAirport(i: AssessInput): AirportWeatherAssessment {
  const F = Date.parse(i.focusIso);
  const conditions = conditionsAt(i, F);
  const observedNow = i.metar && Math.abs(i.metar.obsMs - i.nowMs) < 3 * HOUR
    ? conditionsAt({ ...i, taf: null, series: null }, i.metar.obsMs)
    : null;
  const peak = windPeak(i, F);

  const dataAvailable = conditions !== null || peak !== null;
  const factors: WxFactor[] = dataAvailable
    ? [
      windFactor(i, F, conditions, peak),
      patternFactor(i, F),
      ...alertFactors(i, F),
      visibilityFactor(i, F, conditions),
      precipFactor(i, F, conditions),
      icingFactor(i, F, conditions),
      trendFactor(i, F),
    ].filter((f): f is WxFactor => f !== null)
    : [];

  const sources: string[] = [];
  if (i.series?.length) sources.push("Hourly forecast (Open-Meteo)");
  if (i.taf) sources.push(`TAF ${i.taf.icao}, issued ${fmtTime(i.taf.issuedMs, i.timezone)}`);
  if (i.metar) sources.push(`METAR ${i.metar.icao}, observed ${fmtTime(i.metar.obsMs, i.timezone)}`);
  if (i.alerts.length) sources.push("National Weather Service alerts");

  return {
    airport: i.airport,
    role: i.role,
    timezone: i.timezone,
    focusIso: i.focusIso,
    focusLabel: `${i.focusVerb} ${fmtTime(F, i.timezone)}`,
    level: maxLevel(factors.map((f) => f.level)),
    dataAvailable,
    conditions,
    observedNow,
    factors,
    alerts: i.alerts,
    daily: dailyOutlook(i, F),
    chart: chartSeries(i, F),
    sources,
  };
}
