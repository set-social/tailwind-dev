// supabase/functions/flight-lookup
//
// Looks up a flight's schedule/status from FlightAware AeroAPI, caches it in
// the `flights` table (service role — RLS blocks client writes), and
// returns the normalized row plus real enrichments:
//  - weather at both airports around the relevant time (Open-Meteo — free,
//    keyless), airport coordinates cached in `airports`.
//  - the inbound aircraft's own flight (AeroAPI gives us its fa_flight_id
//    directly), so real status is shown instead of a guessed swap risk.
//  - the aircraft's real live position AND its real flown path so far
//    (lat/lon/altitude/heading, downsampled track) via AeroAPI's
//    /flights/{fa_flight_id}/track, while actually airborne (status
//    "departed") — for the real interactive map on the flight detail
//    view (react-native-maps client-side; no map-image rendering here —
//    an earlier static-image version was replaced once real track data
//    made an actual interactive map possible instead).
// AEROAPI_KEY / OPENSKY_CLIENT_ID / _SECRET are server-side secrets
// (`supabase secrets set`), never shipped to the app.
//
// Two AeroAPI data sources, tried in order: /flights/{ident} (live
// tracking — only returns a flight once FlightAware assigns it an
// fa_flight_id, capped at ~2 days out), then /schedules/{start}/{end}
// (the airline-published timetable, good for up to a year out) if the
// first has nothing — a new route or anything further out is real and
// already scheduled, just not "tracking" yet, so it needs the second
// endpoint, not a 404. The schedule fallback returns a thinner row (no
// estimates/gate/tail — that data doesn't exist pre-tracking); the client
// already renders those fields' null states correctly.
//
// Request:  POST { flightNumber: string /* e.g. "UA1482" */; date: string /* "YYYY-MM-DD" */ }
// Response: { flight: FlightRow; cached: boolean; originWeather: WeatherInfo | null;
//             destinationWeather: WeatherInfo | null; inbound: InboundInfo | null;
//             position: PositionInfo | null /* includes .track: {latitude,longitude}[] */;
//             originCoords: {latitude,longitude} | null; destinationCoords: {latitude,longitude} | null }
//
// Every external call here is bounded with fetchWithTimeout — an earlier
// version of this function let an unbounded OpenSky fetch hang the whole
// response for minutes; weather/inbound are enrichments, so a slow/failed
// one degrades to null rather than holding up (or failing) the request.
//
// NOTE — scope: still no delay-probability forecast or aircraft-swap-risk
// %. There's no real predictive model or spare-aircraft data behind
// either — see src/components/flight/live-flight-view.tsx for what's
// shown instead.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const AEROAPI_KEY = Deno.env.get("AEROAPI_KEY");
// GOOGLE_ROUTES_API_KEY was used here for a static map image; removed once
// the real track data (below) made an actual interactive map possible
// instead. Still used by supabase/functions/drive-time — untouched.
// OPENSKY_CLIENT_ID/_SECRET are still pushed as secrets but unread here —
// see the note near the bottom of this file for why.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Active flights change fast; 5 min keeps AeroAPI calls (metered) down
// without serving badly stale gate/status info.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface LookupRequest {
  flightNumber: string;
  date: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  if (!AEROAPI_KEY) {
    return jsonResponse({ error: "AEROAPI_KEY not configured — run `supabase secrets set`." }, 501);
  }

  let body: LookupRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  if (!body.flightNumber || !body.date) {
    return jsonResponse({ error: "flightNumber and date are required" }, 400);
  }

  const ident = body.flightNumber.replace(/\s+/g, "").toUpperCase();
  const flightKey = `${ident}:${body.date}`;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    let flight: FlightRow;
    const { data: cached } = await db.from("flights").select("*").eq("flight_key", flightKey).maybeSingle();
    const isFresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;

    if (isFresh) {
      flight = cached as FlightRow;
    } else {
      // /flights/{ident} is a live-tracking endpoint — it only returns a
      // flight once FlightAware has assigned it an fa_flight_id, which
      // happens close to departure (~2 days out is the hard cap on this
      // endpoint). A new route or anything further out simply isn't there
      // yet, even though the airline has already published the schedule —
      // that lives on the separate /schedules/{start}/{end} endpoint
      // instead (good for up to a year out), so that's the fallback here
      // rather than a second, different kind of "not found".
      let fetched = await fetchFromAeroApi(ident, body.date);
      if (!fetched) fetched = await fetchFromSchedule(ident, body.date);
      if (!fetched) return jsonResponse({ error: `No flight found for ${ident} on ${body.date}` }, 404);
      flight = { ...fetched, flight_key: flightKey, fetched_at: new Date().toISOString() };
      const { error: upsertError } = await db.from("flights").upsert(flight);
      if (upsertError) console.error("flights upsert failed:", upsertError.message);
    }

    // Enrichments run in parallel and never fail the request — each is
    // independently bounded, and a null just means that card is empty.
    // originCoords/destinationCoords reuse the same `airports` cache
    // fetchAirportWeather already hits — the client needs them too now,
    // to draw the map's remaining-path line and fit its bounds.
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

    return jsonResponse({
      flight, cached: Boolean(isFresh), originWeather, destinationWeather, inbound, position, originCoords, destinationCoords,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "flight-lookup failed", detail: String(err) }, 500);
  }
});

/** Bounds a fetch with AbortController — without this, a slow/unreachable upstream (this hit OpenSky's auth endpoint in practice) hangs the whole function for minutes before Supabase's own platform timeout ever kicks in. */
function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface FlightRow {
  flight_key: string;
  airline_code: string;
  airline_name: string | null;
  flight_number: string;
  origin: string;
  destination: string;
  scheduled_departure: string;
  estimated_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  status: string;
  gate: string | null;
  terminal: string | null;
  aircraft_type: string | null;
  tail_number: string | null;
  source: string;
  raw?: { inbound_fa_flight_id?: string | null; fa_flight_id?: string | null };
}

/** FlightAware AeroAPI — https://www.flightaware.com/aeroapi/portal/documentation */
async function fetchFromAeroApi(ident: string, date: string): Promise<Omit<FlightRow, "flight_key" | "fetched_at"> | null> {
  const res = await fetchWithTimeout(
    `https://aeroapi.flightaware.com/aeroapi/flights/${ident}`,
    { headers: { "x-apikey": AEROAPI_KEY! } },
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

function flightRowFromAeroApi(ident: string, match: any): Omit<FlightRow, "flight_key" | "fetched_at"> {
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
 * The airline-published schedule (https://www.flightaware.com/aeroapi/portal/documentation
 * — /schedules/{start}/{end}), for when fetchFromAeroApi has nothing yet.
 * Schedule-only: no live status/estimates/gate/tail exist pre-tracking, so
 * this deliberately returns a thinner row (status always "scheduled")
 * rather than guessing — the client already renders those fields'
 * null/"Not posted yet" states correctly.
 */
async function fetchFromSchedule(ident: string, date: string): Promise<Omit<FlightRow, "flight_key" | "fetched_at"> | null> {
  const airlineCode = ident.match(/^[A-Z]{2,3}/)?.[0];
  const flightNumber = parseInt(ident.replace(/^[A-Z]+/, ""), 10);
  if (!airlineCode || !Number.isFinite(flightNumber)) return null;

  const dateEnd = new Date(`${date}T00:00:00Z`);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
  const dateEndStr = dateEnd.toISOString().slice(0, 10);

  const res = await fetchWithTimeout(
    `https://aeroapi.flightaware.com/aeroapi/schedules/${date}/${dateEndStr}?airline=${airlineCode}&flight_number=${flightNumber}`,
    { headers: { "x-apikey": AEROAPI_KEY! } },
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

function mapStatus(f: any): string {
  if (f.cancelled) return "cancelled";
  if (f.diverted) return "diverted";
  if (f.actual_in) return "landed";
  if (f.actual_out) return "departed";
  if (String(f.status ?? "").toLowerCase().includes("board")) return "boarding";
  if (f.estimated_out && f.estimated_out !== f.scheduled_out) return "delayed";
  return "scheduled";
}

interface AirportCoords {
  latitude: number;
  longitude: number;
}

/** AeroAPI /airports/{code}, cached indefinitely in `airports` (they don't move). */
async function fetchAirportCoords(db: SupabaseClient, code: string): Promise<AirportCoords | null> {
  try {
    const { data: cached } = await db.from("airports").select("*").eq("code", code).maybeSingle();
    if (cached?.latitude != null && cached?.longitude != null) {
      return { latitude: cached.latitude, longitude: cached.longitude };
    }
    const res = await fetchWithTimeout(`https://aeroapi.flightaware.com/aeroapi/airports/${code}`, {
      headers: { "x-apikey": AEROAPI_KEY! },
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
      fetched_at: new Date().toISOString(),
    });
    return { latitude: a.latitude, longitude: a.longitude };
  } catch (err) {
    console.error(`airport coords lookup failed for ${code}:`, err);
    return null;
  }
}

export interface WeatherInfo {
  tempC: number;
  precipitationMm: number;
  windKph: number;
  condition: string; // "clear" | "partly" | "cloud" | "rain" | "storm" | "fog"
  summary: string;
  forTime: string; // ISO — the hourly slot this actually describes
}

/** Maps WMO weather codes (Open-Meteo's scheme) to this app's Condition enum + a plain-language summary. */
function conditionFromWmo(code: number): { condition: WeatherInfo["condition"]; summary: string } {
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
async function fetchAirportWeather(db: SupabaseClient, airportCode: string, atIso: string | null): Promise<WeatherInfo | null> {
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

export interface InboundInfo {
  code: string; // "UA 1845"
  origin: string;
  destination: string;
  status: string;
  scheduledArrival: string;
  estimatedArrival: string | null;
  delayMinutes: number;
}

/** The real inbound aircraft's own flight — AeroAPI gives us its fa_flight_id directly on the outbound flight's payload, so this is one more real lookup, not a guess. */
async function fetchInbound(faFlightId: string | null, expectedDestination: string): Promise<InboundInfo | null> {
  if (!faFlightId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}`,
      { headers: { "x-apikey": AEROAPI_KEY! } },
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
    };
  } catch (err) {
    console.error("inbound flight lookup failed:", err);
    return null;
  }
}

export interface PositionInfo {
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundspeedKts: number;
  heading: number | null;
  timestamp: string;
  /** The real flown path so far (downsampled — AeroAPI can return hundreds of points for a long flight), oldest first. Not a straight line: this is where the aircraft actually went. */
  track: { latitude: number; longitude: number }[];
}

const MAX_TRACK_POINTS = 80;

/** Downsamples to at most `max` points, always keeping the first and last. */
function downsampleTrack(positions: any[], max: number): { latitude: number; longitude: number }[] {
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

/** Real live position AND the real flown path — AeroAPI's /flights/{fa_flight_id}/track. Only called while the flight's own status is "departed" (see the call site). */
async function fetchPosition(faFlightId: string | null): Promise<PositionInfo | null> {
  if (!faFlightId) return null;
  try {
    const res = await fetchWithTimeout(
      `https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}/track`,
      { headers: { "x-apikey": AEROAPI_KEY! } },
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

// OpenSky (OPENSKY_CLIENT_ID/_SECRET) isn't called from here anymore: the
// previous version fetched an OAuth token and did nothing with it — dead
// code that was also, unbounded, what made every lookup take minutes (see
// the fetchWithTimeout comment above). Real inbound-aircraft data now
// comes from fetchInbound (AeroAPI) instead. Wiring OpenSky back in needs
// the tail_number -> icao24 resolution described in the original TODO
// here; until then it's better left out than kept as an unused stub.
