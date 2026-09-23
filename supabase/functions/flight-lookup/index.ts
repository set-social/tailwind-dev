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
// The lookup + enrichment logic itself lives in ../_shared/flight-context.ts
// (with the AeroAPI / airport / weather fetchers beside it) so the assistant
// loads a flight exactly the same way; this file is just the HTTP wrapper.
//
// NOTE — scope: still no delay-probability forecast or aircraft-swap-risk
// %. There's no real predictive model or spare-aircraft data behind
// either — see src/components/flight/live-flight-view.tsx for what's
// shown instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { aeroApiKey } from "../_shared/aeroapi.ts";
import { lookupFlight } from "../_shared/flight-context.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// OPENSKY_CLIENT_ID/_SECRET are still pushed as secrets but unread here —
// see the note at the bottom of this file for why.

interface LookupRequest {
  flightNumber: string;
  date: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  if (!aeroApiKey()) {
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
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const result = await lookupFlight(db, ident, body.date);
    if (!result) return jsonResponse({ error: `No flight found for ${ident} on ${body.date}` }, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "flight-lookup failed", detail: String(err) }, 500);
  }
});

// OpenSky (OPENSKY_CLIENT_ID/_SECRET) isn't called from here anymore: the
// previous version fetched an OAuth token and did nothing with it — dead
// code that was also, unbounded, what made every lookup take minutes (see
// the fetchWithTimeout comment in ../_shared/http.ts). Real inbound-aircraft
// data now comes from fetchInbound (AeroAPI) instead. Wiring OpenSky back in
// needs the tail_number -> icao24 resolution described in the original TODO
// here; until then it's better left out than kept as an unused stub.
