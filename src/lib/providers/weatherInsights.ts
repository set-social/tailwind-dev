import type { WeatherInsights } from "@/lib/types";
import { supabase } from "@/lib/supabase";

/**
 * Weather findings + AI recommendations for one flight, from the
 * `weather-insights` Edge Function (supabase/functions/weather-insights).
 *
 * Returns null on any failure — weather is an enrichment, so a screen that
 * gets null simply doesn't show the card (or falls back to what it had); it
 * never blocks or errors the flight view. The server already caches (weather
 * sources, and the AI narrative per set of facts), so this only de-duplicates
 * the same flight being asked for by Home and the detail screen in quick
 * succession.
 */
const FRESH_MS = 5 * 60_000;
const FAILED_RETRY_MS = 30_000;

const inflight = new Map<string, { at: number; ok: boolean; value: Promise<WeatherInsights | null> }>();

export function clearWeatherInsightsCache() {
  inflight.clear();
}

export function fetchWeatherInsights(flightKey: string, opts: { force?: boolean } = {}): Promise<WeatherInsights | null> {
  if (!supabase) return Promise.resolve(null);
  const hit = inflight.get(flightKey);
  if (!opts.force && hit && Date.now() - hit.at < (hit.ok ? FRESH_MS : FAILED_RETRY_MS)) return hit.value;

  const entry = { at: Date.now(), ok: true, value: Promise.resolve<WeatherInsights | null>(null) };
  entry.value = supabase.functions
    .invoke("weather-insights", { body: { flightKey } })
    .then(({ data, error }) => {
      if (error || !data || data.error || !data.departure || !data.arrival) { entry.ok = false; return null; }
      return data as WeatherInsights;
    })
    .catch((err) => {
      console.warn("weather insights unavailable:", err);
      entry.ok = false;
      return null;
    });
  inflight.set(flightKey, entry);
  return entry.value;
}
