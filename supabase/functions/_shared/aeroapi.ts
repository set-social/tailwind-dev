// FlightAware AeroAPI fetchers shared by flight-lookup and the assistant.
// AeroAPI is metered per call — callers go through flight-context.ts, which
// checks the `flights` cache first, rather than calling these directly.
// AEROAPI_KEY is a server-side secret, read at call time.

import { fetchWithTimeout } from "./http.ts";
import type { FlightRow, InboundInfo, PositionInfo } from "./types.ts";

export const aeroApiKey = () => Deno.env.get("AEROAPI_KEY");

export type FlightRowInput = Omit<FlightRow, "flight_key" | "fetched_at">;

export function mapStatus(f: any): string {
  if (f.cancelled) return "cancelled";
  if (f.diverted) return "diverted";
  if (f.actual_in) return "landed";
  if (f.actual_out) return "departed";
  if (String(f.status ?? "").toLowerCase().includes("board")) return "boarding";
  if (f.estimated_out && f.estimated_out !== f.scheduled_out) return "delayed";
  return "scheduled";
}

/** FlightAware AeroAPI — https://www.flightaware.com/aeroapi/portal/documentation */
export async function fetchFromAeroApi(ident: string, date: string): Promise<FlightRowInput | null> {
  const res = await fetchWithTimeout(
    `https://aeroapi.flightaware.com/aeroapi/flights/${ident}`,
    { headers: { "x-apikey": aeroApiKey()! } },
    15000,
  );
  if (!res.ok) {
    console.error("AeroAPI error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const flights: any[] = data.flights ?? [];
  // Exact date match only: falling back to flights[0] when the requested
  // date isn't in AeroAPI's returned window used to silently return a
  // *different* date's flight while still labeling the cache row with the
  // requested date — wrong data under a misleading key. Not found beats
  // wrong.
  const match = flights.find((f) => (f.scheduled_out ?? "").startsWith(date));
  if (!match) return null;
  return flightRowFromAeroApi(ident, match);
}

export function flightRowFromAeroApi(ident: string, match: any): FlightRowInput {
  return {
    airline_code: (ident.match(/^[A-Z]{2,3}/)?.[0] ?? ident.slice(0, 2)) as string,
    airline_name: match.operator ?? null,
    // AeroAPI's own numeric flight_number ("1482"), not the full ident ("UA1482").
    flight_number: match.flight_number ?? ident.replace(/^[A-Z]+/, ""),
    origin: match.origin?.code_iata ?? match.origin?.code,
    destination: match.destination?.code_iata ?? match.destination?.code,
    scheduled_departure: match.scheduled_out,
    estimated_departure: match.estimated_out ?? null,
    actual_departure: match.actual_out ?? null,
    scheduled_arrival: match.scheduled_in,
    estimated_arrival: match.estimated_in ?? null,
    actual_arrival: match.actual_in ?? null,
    status: mapStatus(match),
    gate: match.gate_origin ?? null,
    terminal: match.terminal_origin ?? null,
    aircraft_type: match.aircraft_type ?? null,
    tail_number: match.registration ?? null,
    source: "aeroapi",
    raw: match,
  };
}

/**
 * The airline-published schedule (/schedules/{start}/{end}), for when
 * fetchFromAeroApi has nothing yet. Schedule-only: no live status/
 * estimates/gate/tail exist pre-tracking, so this deliberately returns a
 * thinner row (status always "scheduled") rather than guessing — the client
 * already renders those fields' null/"Not posted yet" states correctly.
 */
export async function fetchFromSchedule(ident: string, date: string): Promise<FlightRowInput | null> {
  const airlineCode = ident.match(/^[A-Z]{2,3}/)?.[0];
  const flightNumber = parseInt(ident.replace(/^[A-Z]+/, ""), 10);
  if (!airlineCode || !Number.isFinite(flightNumber)) return null;

  const dateEnd = new Date(`${date}T00:00:00Z`);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
  const dateEndStr = dateEnd.toISOString().slice(0, 10);

  const res = await fetchWithTimeout(
    `https://aeroapi.flightaware.com/aeroapi/schedules/${date}/${dateEndStr}?airline=${airlineCode}&flight_number=${flightNumber}`,
    { headers: { "x-apikey": aeroApiKey()! } },
    15000,
  );
  if (!res.ok) {
    console.error("AeroAPI schedules error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const match = (data.scheduled ?? [])[0];
  if (!match) return null;

  return {
    airline_code: airlineCode,
    airline_name: null,
    flight_number: String(flightNumber),
    origin: match.origin_iata ?? match.origin,
    destination: match.destination_iata ?? match.destination,
    scheduled_departure: match.scheduled_out,
    estimated_departure: null,
    actual_departure: null,
    scheduled_arrival: match.scheduled_in,
    estimated_arrival: null,
    actual_arrival: null,
    status: "scheduled",
    gate: null,
    terminal: null,
    aircraft_type: match.aircraft_type ?? null,
    tail_number: null,
    source: "aeroapi-schedule",
    raw: match,
  };
}

/** The real inbound aircraft's own flight — AeroAPI gives us its fa_flight_id directly on the outbound flight's payload, so this is one more real lookup, not a guess. */
export async function fetchInbound(faFlightId: string | null, expectedDestination: string): Promise<InboundInfo | null> {
  if (!faFlightId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}`,
      { headers: { "x-apikey": aeroApiKey()! } },
      10000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data.flights ?? [])[0];
    if (!match) return null;
    const delayMinutes = match.estimated_in && match.scheduled_in
      ? Math.round((new Date(match.estimated_in).getTime() - new Date(match.scheduled_in).getTime()) / 60000)
      : 0;
    return {
      code: `${match.operator_iata ?? ""} ${match.flight_number ?? ""}`.trim(),
      origin: match.origin?.code_iata ?? match.origin?.code ?? "?",
      destination: match.destination?.code_iata ?? expectedDestination,
      status: mapStatus(match),
      scheduledArrival: match.scheduled_in,
      estimatedArrival: match.estimated_in ?? null,
      delayMinutes,
      scheduledDeparture: match.scheduled_out ?? null,
      estimatedDeparture: match.estimated_out ?? match.scheduled_out ?? null,
    };
  } catch (err) {
    console.error("inbound flight lookup failed:", err);
    return null;
  }
}

export const MAX_TRACK_POINTS = 80;

/** Downsamples to at most `max` points, always keeping the first and last. */
export function downsampleTrack(positions: any[], max: number): { latitude: number; longitude: number }[] {
  const valid = positions.filter((p) => p && p.latitude != null && p.longitude != null);
  if (valid.length <= max) return valid.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const step = (valid.length - 1) / (max - 1);
  const out: { latitude: number; longitude: number }[] = [];
  for (let i = 0; i < max; i++) {
    const p = valid[Math.round(i * step)];
    out.push({ latitude: p.latitude, longitude: p.longitude });
  }
  return out;
}

/** Real live position AND the real flown path — AeroAPI's /flights/{fa_flight_id}/track. Only called while the flight's own status is "departed". */
export async function fetchPosition(faFlightId: string | null): Promise<PositionInfo | null> {
  if (!faFlightId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}/track`,
      { headers: { "x-apikey": aeroApiKey()! } },
      10000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const positions: any[] = data.positions ?? [];
    const latest = positions[positions.length - 1];
    if (!latest || latest.latitude == null || latest.longitude == null) return null;
    return {
      latitude: latest.latitude,
      longitude: latest.longitude,
      altitudeFt: (latest.altitude ?? 0) * 100, // AeroAPI reports altitude in hundreds of feet
      groundspeedKts: latest.groundspeed ?? 0,
      heading: latest.heading ?? null,
      timestamp: latest.timestamp,
      track: downsampleTrack(positions, MAX_TRACK_POINTS),
    };
  } catch (err) {
    console.error("position track lookup failed:", err);
    return null;
  }
}
