import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aeroApiKey } from "./aeroapi.ts";
import { fetchWithTimeout } from "./http.ts";
import type { AirportCoords } from "./types.ts";

/** AeroAPI /airports/{code}, cached indefinitely in `airports` (they don't move). */
export async function fetchAirportCoords(db: SupabaseClient, code: string): Promise<AirportCoords | null> {
  try {
    const { data: cached } = await db.from("airports").select("*").eq("code", code).maybeSingle();
    if (cached?.latitude != null && cached?.longitude != null) {
      return { latitude: cached.latitude, longitude: cached.longitude, icao: cached.icao ?? null, timezone: cached.timezone ?? null };
    }
    const res = await fetchWithTimeout(`https://aeroapi.flightaware.com/aeroapi/airports/${code}`, {
      headers: { "x-apikey": aeroApiKey()! },
    }, 10000);
    if (!res.ok) return null;
    const a = await res.json();
    if (a.latitude == null || a.longitude == null) return null;
    await db.from("airports").upsert({
      code,
      name: a.name ?? null,
      city: a.city ?? null,
      latitude: a.latitude,
      longitude: a.longitude,
      timezone: a.timezone ?? null,
      icao: a.code_icao ?? a.airport_code ?? null,
      fetched_at: new Date().toISOString(),
    });
    return { latitude: a.latitude, longitude: a.longitude, icao: a.code_icao ?? a.airport_code ?? null, timezone: a.timezone ?? null };
  } catch (err) {
    console.error(`airport coords lookup failed for ${code}:`, err);
    return null;
  }
}
