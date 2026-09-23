// Parsers for the three weather upstreams, kept pure (JSON in, typed data
// out) so they can be unit-tested against real payload shapes without a
// network. Units are aviation units throughout: knots, statute miles, feet.
//
//   Open-Meteo hourly forecast  https://open-meteo.com  (free, keyless)
//   METAR / TAF                 https://aviationweather.gov/api/data
//   NWS alerts                  https://api.weather.gov/alerts/active

import type { FlightCategory, WxAlert } from "./types.ts";

const M_PER_MILE = 1609.344;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// ─── flight category ─────────────────────────────────────────────────────

/** FAA flight category from the lowest broken/overcast layer and visibility. Null when neither is known. */
export function flightCategory(ceilingFt: number | null, visMi: number | null): FlightCategory | null {
  if (ceilingFt === null && visMi === null) return null;
  if ((ceilingFt !== null && ceilingFt < 500) || (visMi !== null && visMi < 1)) return "LIFR";
  if ((ceilingFt !== null && ceilingFt < 1000) || (visMi !== null && visMi < 3)) return "IFR";
  if ((ceilingFt !== null && ceilingFt <= 3000) || (visMi !== null && visMi <= 5)) return "MVFR";
  return "VFR";
}

export const CATEGORY_RANK: Record<FlightCategory, number> = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };

/** Lowest ceiling: the base of the lowest BKN / OVC / vertical-visibility layer. Few/scattered aren't ceilings. */
export function ceilingOf(clouds: unknown): number | null {
  if (!Array.isArray(clouds)) return null;
  const bases = clouds
    .filter((c) => ["BKN", "OVC", "OVX", "VV"].includes(String(c?.cover ?? "").toUpperCase()))
    .map((c) => num(c?.base))
    .filter((b): b is number => b !== null);
  return bases.length ? Math.min(...bases) : null;
}

// ─── Open-Meteo ──────────────────────────────────────────────────────────

export interface HourPoint {
  ms: number;
  windKt: number;
  gustKt: number;
  dirDeg: number | null;
  precipMm: number;
  visMi: number | null;
  tempC: number | null;
  code: number | null;
  pressureHpa: number | null;
}

/** Open-Meteo `hourly` arrays -> one point per hour. Requested with wind_speed_unit=kn and timezone=UTC. */
export function parseOpenMeteo(json: any): HourPoint[] {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const out: HourPoint[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const ms = Date.parse(`${h.time[i]}:00Z`);
    if (!Number.isFinite(ms)) continue;
    const wind = num(h.wind_speed_10m?.[i]) ?? 0;
    const vis = num(h.visibility?.[i]);
    out.push({
      ms,
      windKt: wind,
      gustKt: Math.max(num(h.wind_gusts_10m?.[i]) ?? wind, wind),
      dirDeg: num(h.wind_direction_10m?.[i]),
      precipMm: num(h.precipitation?.[i]) ?? 0,
      visMi: vis === null ? null : Math.round((vis / M_PER_MILE) * 10) / 10,
      tempC: num(h.temperature_2m?.[i]),
      code: num(h.weather_code?.[i]),
      pressureHpa: num(h.pressure_msl?.[i]),
    });
  }
  return out;
}

// ─── METAR ───────────────────────────────────────────────────────────────

export interface MetarObs {
  icao: string;
  obsMs: number;
  dirDeg: number | null;
  windKt: number | null;
  gustKt: number | null;
  visMi: number | null;
  ceilingFt: number | null;
  category: FlightCategory | null;
  wx: string | null;
  tempC: number | null;
}

export function parseMetar(json: any): MetarObs | null {
  const m = Array.isArray(json) ? json[0] : null;
  if (!m || !m.icaoId || num(m.obsTime) === null) return null;
  const ceilingFt = ceilingOf(m.clouds);
  const visMi = num(m.visib);
  return {
    icao: String(m.icaoId),
    obsMs: (num(m.obsTime) as number) * 1000,
    dirDeg: typeof m.wdir === "number" ? m.wdir : null, // "VRB" arrives as a string
    windKt: num(m.wspd),
    gustKt: num(m.wgst),
    visMi,
    ceilingFt,
    category: (["VFR", "MVFR", "IFR", "LIFR"].includes(m.fltCat) ? m.fltCat : flightCategory(ceilingFt, visMi)) as FlightCategory | null,
    wx: typeof m.wxString === "string" && m.wxString ? m.wxString : null,
    tempC: num(m.temp),
  };
}

// ─── TAF ─────────────────────────────────────────────────────────────────

export interface TafPeriod {
  fromMs: number;
  toMs: number;
  /** null = the initial forecast; FM/BECMG replace conditions; TEMPO/PROB are possible temporary deviations. */
  change: "FM" | "BECMG" | "TEMPO" | "PROB" | null;
  probability: number | null;
  dirDeg: number | null;
  windKt: number | null;
  gustKt: number | null;
  visMi: number | null;
  ceilingFt: number | null;
  wx: string | null;
}

export interface TafData {
  icao: string;
  issuedMs: number;
  periods: TafPeriod[];
}

export function parseTaf(json: any): TafData | null {
  const t = Array.isArray(json) ? json[0] : null;
  if (!t || !t.icaoId || !Array.isArray(t.fcsts)) return null;
  const periods: TafPeriod[] = [];
  for (const f of t.fcsts) {
    const from = num(f.timeFrom), to = num(f.timeTo);
    if (from === null || to === null) continue;
    const raw = String(f.fcstChange ?? "").toUpperCase();
    const change = raw === "" ? null : raw.startsWith("PROB") ? "PROB" : (["FM", "BECMG", "TEMPO"].includes(raw) ? raw : null) as TafPeriod["change"];
    periods.push({
      fromMs: from * 1000,
      toMs: to * 1000,
      change,
      probability: num(f.probability),
      dirDeg: typeof f.wdir === "number" ? f.wdir : null,
      windKt: num(f.wspd),
      gustKt: num(f.wgst),
      visMi: num(f.visib),
      ceilingFt: ceilingOf(f.clouds),
      wx: typeof f.wxString === "string" && f.wxString ? f.wxString : null,
    });
  }
  const issued = Date.parse(t.issueTime ?? "");
  return periods.length ? { icao: String(t.icaoId), issuedMs: Number.isFinite(issued) ? issued : (periods[0].fromMs), periods } : null;
}

/** The forecast in force at `ms`: the base period, plus any TEMPO/PROB groups that overlap it. */
export function tafAt(taf: TafData | null, ms: number): { base: TafPeriod | null; tempos: TafPeriod[] } {
  if (!taf) return { base: null, tempos: [] };
  const covering = taf.periods.filter((p) => p.fromMs <= ms && ms < p.toMs);
  const bases = covering.filter((p) => p.change === null || p.change === "FM" || p.change === "BECMG");
  return { base: bases.length ? bases[bases.length - 1] : null, tempos: covering.filter((p) => p.change === "TEMPO" || p.change === "PROB") };
}

// ─── NWS alerts ──────────────────────────────────────────────────────────

const SEVERITY_ORDER = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

/** NWS GeoJSON alert collection -> compact alerts, most severe first. Free text is truncated: it's untrusted data. */
export function parseNwsAlerts(json: any, max = 4): WxAlert[] {
  const feats: any[] = Array.isArray(json?.features) ? json.features : [];
  const out: WxAlert[] = feats
    .map((f) => f?.properties)
    .filter((p) => p && p.event && p.status !== "Test")
    .map((p) => ({
      event: String(p.event).slice(0, 80),
      severity: String(p.severity ?? "Unknown"),
      headline: String(p.headline ?? p.event).replace(/\s+/g, " ").slice(0, 200),
      onsetIso: p.onset ?? p.effective ?? null,
      endsIso: p.ends ?? p.expires ?? null,
      description: String(p.description ?? "").replace(/\s+/g, " ").slice(0, 600),
    }));
  out.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return out.slice(0, max);
}
