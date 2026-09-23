import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAirportCoords } from "./airports.ts";
import { fetchWithTimeout } from "./http.ts";
import type { WeatherInfo } from "./types.ts";

/** Maps WMO weather codes (Open-Meteo's scheme) to this app's Condition enum + a plain-language summary. */
export function conditionFromWmo(code: number): { condition: WeatherInfo["condition"]; summary: string } {
  if (code === 0) return { condition: "clear", summary: "Clear" };
  if (code <= 2) return { condition: "partly", summary: "Partly cloudy" };
  if (code === 3) return { condition: "cloud", summary: "Overcast" };
  if (code === 45 || code === 48) return { condition: "fog", summary: "Fog" };
  if (code >= 51 && code <= 67) return { condition: "rain", summary: "Rain" };
  if (code >= 71 && code <= 77) return { condition: "storm", summary: "Snow" };
  if (code >= 80 && code <= 82) return { condition: "rain", summary: "Rain showers" };
  if (code >= 95) return { condition: "storm", summary: "Thunderstorms" };
  return { condition: "cloud", summary: "Overcast" };
}

/** Open-Meteo (https://open-meteo.com) — free, no key. Picks the hourly slot nearest `atIso` rather than just "right now", since a flight hours out should show forecast weather at departure/arrival, not the current moment. */
export async function fetchAirportWeather(db: SupabaseClient, airportCode: string, atIso: string | null): Promise<WeatherInfo | null> {
  if (!airportCode || !atIso) return null;
  try {
    const coords = await fetchAirportCoords(db, airportCode);
    if (!coords) return null;

    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
        `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m&forecast_days=3&timezone=UTC`,
      {},
      10000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data.hourly?.time ?? [];
    if (times.length === 0) return null;

    const target = new Date(atIso).getTime();
    let bestIdx = 0;
    let bestDiff = Infinity;
    times.forEach((t, i) => {
      const diff = Math.abs(new Date(`${t}:00Z`).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });

    const { condition, summary } = conditionFromWmo(data.hourly.weather_code[bestIdx]);
    return {
      tempC: data.hourly.temperature_2m[bestIdx],
      precipitationMm: data.hourly.precipitation[bestIdx],
      windKph: data.hourly.wind_speed_10m[bestIdx],
      condition,
      summary,
      forTime: `${times[bestIdx]}:00Z`,
    };
  } catch (err) {
    console.error(`weather lookup failed for ${airportCode}:`, err);
    return null;
  }
}
