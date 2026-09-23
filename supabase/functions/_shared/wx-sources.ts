// Fetches the weather upstreams behind a shared Postgres cache
// (`weather_cache`, migration 0005). The upstreams are free but rate limited,
// and many travelers look at the same airport, so one call per TTL serves
// them all. Every fetch is bounded (fetchWithTimeout) and degrades to null:
// weather is an enrichment and must never fail a request.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "./http.ts";
import type { AirportCoords, WxAlert } from "./types.ts";
import { parseMetar, parseNwsAlerts, parseOpenMeteo, parseTaf, type HourPoint, type MetarObs, type TafData } from "./wx-parse.ts";

export const TTL = {
  series: 30 * 60_000,
  metar: 10 * 60_000,
  taf: 30 * 60_000,
  alerts: 10 * 60_000,
};

/**
 * Cache-through helper. `fetcher` returns the value, `null` for "the source
 * has nothing for this key" (cached, so we don't hammer it for airports it
 * doesn't cover), or `undefined` for a failure (not cached; a stale copy is
 * served instead if we have one — old weather beats no weather).
 */
export async function cachedJson<T>(
  db: SupabaseClient,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T | null | undefined>,
): Promise<T | null> {
  let stale: T | null = null;
  try {
    const { data } = await db.from("weather_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
    if (data) {
      const value = (data.payload as { v: T | null }).v;
      if (Date.now() - Date.parse(data.fetched_at) < ttlMs) return value;
      stale = value;
    }
  } catch (err) {
    console.error(`weather_cache read failed for ${key}:`, err);
  }

  let fresh: T | null | undefined;
  try {
    fresh = await fetcher();
  } catch (err) {
    console.error(`weather fetch failed for ${key}:`, err);
    fresh = undefined;
  }
  if (fresh === undefined) return stale;

  try {
    await db.from("weather_cache").upsert({ cache_key: key, payload: { v: fresh }, fetched_at: new Date().toISOString() });
  } catch (err) {
    console.error(`weather_cache write failed for ${key}:`, err);
  }
  return fresh;
}

const json = async (res: Response): Promise<unknown | undefined> => {
  const text = await res.text();
  if (!text.trim()) return null; // 204 / empty body: the source has nothing
  try { return JSON.parse(text); } catch { return undefined; }
};

// ─── Open-Meteo hourly forecast (8 days, knots) ──────────────────────────

export function forecastSeries(db: SupabaseClient, iata: string, c: AirportCoords): Promise<HourPoint[] | null> {
  return cachedJson<HourPoint[]>(db, `om:${iata}`, TTL.series, async () => {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}` +
        `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,pressure_msl` +
        `&wind_speed_unit=kn&forecast_days=8&timezone=UTC`,
      {},
      10000,
    );
    if (!res.ok) return undefined;
    const body = await json(res);
    if (body === undefined) return undefined;
    const pts = parseOpenMeteo(body);
    return pts.length ? pts : null;
  });
}

// ─── aviationweather.gov METAR / TAF ─────────────────────────────────────

const CONUS = (c: AirportCoords) => c.latitude >= 24 && c.latitude <= 50 && c.longitude >= -125 && c.longitude <= -66;

/**
 * The station code METAR/TAF are keyed on. AeroAPI gives it (cached in
 * airports.icao); for older cached rows in the lower 48 it's "K" + the IATA
 * code, which the feed simply returns nothing for if wrong. Elsewhere: none,
 * and the forecast model covers it.
 */
export function icaoFor(iata: string, c: AirportCoords | null): string | null {
  if (c?.icao && /^[A-Z0-9]{4}$/.test(c.icao)) return c.icao;
  return c && CONUS(c) && /^[A-Z]{3}$/.test(iata) ? `K${iata}` : null;
}

export function fetchMetar(db: SupabaseClient, icao: string): Promise<MetarObs | null> {
  return cachedJson<MetarObs>(db, `metar:${icao}`, TTL.metar, async () => {
    const res = await fetchWithTimeout(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`, {}, 10000);
    if (!res.ok && res.status !== 204) return undefined;
    const body = await json(res);
    return body === undefined ? undefined : parseMetar(body);
  });
}

export function fetchTaf(db: SupabaseClient, icao: string): Promise<TafData | null> {
  return cachedJson<TafData>(db, `taf:${icao}`, TTL.taf, async () => {
    const res = await fetchWithTimeout(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`, {}, 10000);
    if (!res.ok && res.status !== 204) return undefined;
    const body = await json(res);
    return body === undefined ? undefined : parseTaf(body);
  });
}

// ─── National Weather Service alerts (US only) ───────────────────────────

const inUs = (c: AirportCoords) => c.latitude >= 17 && c.latitude <= 72 && c.longitude >= -180 && c.longitude <= -64;

export function fetchAlerts(db: SupabaseClient, iata: string, c: AirportCoords): Promise<WxAlert[]> {
  if (!inUs(c)) return Promise.resolve([]);
  return cachedJson<WxAlert[]>(db, `nws:${iata}`, TTL.alerts, async () => {
    const res = await fetchWithTimeout(
      `https://api.weather.gov/alerts/active?point=${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`,
      // NWS asks API clients to identify themselves.
      { headers: { "User-Agent": Deno.env.get("NWS_USER_AGENT") ?? "FlightIQ flight-intelligence app", Accept: "application/geo+json" } },
      10000,
    );
    if (!res.ok) return undefined;
    const body = await json(res);
    return body === undefined ? undefined : parseNwsAlerts(body);
  }).then((a) => a ?? []);
}
