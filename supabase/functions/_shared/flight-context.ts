// The one place that turns "a flight" into a cached row plus its real
// enrichments. flight-lookup (client-facing) and the assistant (server-side
// context) both go through here, so a flight is loaded — and AeroAPI billed —
// exactly one way, and the assistant can never see data the app wouldn't.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aeroApiKey, fetchFromAeroApi, fetchFromSchedule, fetchInbound, fetchPosition } from "./aeroapi.ts";
import { fetchAirportCoords } from "./airports.ts";
import { fetchAirportWeather } from "./weather.ts";
import type { FlightLookupResult, FlightRow } from "./types.ts";

// Active flights change fast; 5 min keeps AeroAPI calls (metered) down
// without serving badly stale gate/status info.
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** Thrown when a cache miss needs AeroAPI but AEROAPI_KEY isn't set. */
export class UpstreamNotConfigured extends Error {}

const FLIGHT_KEY = /^([A-Z0-9]{2,3}\d{1,4}[A-Z]?):(\d{4}-\d{2}-\d{2})$/;

/** "UA1482:2026-09-22" -> { ident: "UA1482", date: "2026-09-22" }; null if malformed. */
export function parseFlightKey(key: string): { ident: string; date: string } | null {
  const m = FLIGHT_KEY.exec(key);
  return m ? { ident: m[1], date: m[2] } : null;
}

/**
 * Cache-first flight lookup + parallel enrichments. Returns null when the
 * flight genuinely doesn't exist (not found beats wrong). Enrichments are
 * each independently bounded and degrade to null, never failing the call.
 */
export async function lookupFlight(db: SupabaseClient, ident: string, date: string): Promise<FlightLookupResult | null> {
  const flightKey = `${ident}:${date}`;
  let flight: FlightRow;

  const { data: cached } = await db.from("flights").select("*").eq("flight_key", flightKey).maybeSingle();
  const isFresh = Boolean(cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS);

  if (isFresh) {
    flight = cached as FlightRow;
  } else {
    if (!aeroApiKey()) throw new UpstreamNotConfigured("AEROAPI_KEY not configured");
    // /flights/{ident} is a live-tracking endpoint — it only returns a
    // flight once FlightAware has assigned it an fa_flight_id, which
    // happens close to departure (~2 days out is the hard cap on this
    // endpoint). A new route or anything further out simply isn't there
    // yet, even though the airline has already published the schedule —
    // that lives on the separate /schedules/{start}/{end} endpoint
    // instead (good for up to a year out), so that's the fallback here
    // rather than a second, different kind of "not found".
    let fetched = await fetchFromAeroApi(ident, date);
    if (!fetched) fetched = await fetchFromSchedule(ident, date);
    if (!fetched) return null;
    flight = { ...fetched, flight_key: flightKey, fetched_at: new Date().toISOString() };
    const { error: upsertError } = await db.from("flights").upsert(flight);
    if (upsertError) console.error("flights upsert failed:", upsertError.message);
  }

  // Enrichments run in parallel and never fail the request — each is
  // independently bounded, and a null just means that card is empty.
  const [originWeather, destinationWeather, inbound, position, originCoords, destinationCoords] = await Promise.all([
    fetchAirportWeather(db, flight.origin, flight.scheduled_departure),
    fetchAirportWeather(db, flight.destination, flight.scheduled_arrival),
    fetchInbound(flight.raw?.inbound_fa_flight_id ?? null, flight.origin),
    // Only worth asking for while actually airborne — scheduled/landed
    // flights have no "where is it right now" to show.
    flight.status === "departed" ? fetchPosition(flight.raw?.fa_flight_id ?? null) : Promise.resolve(null),
    fetchAirportCoords(db, flight.origin),
    fetchAirportCoords(db, flight.destination),
  ]);

  return { flight, cached: isFresh, originWeather, destinationWeather, inbound, position, originCoords, destinationCoords };
}
