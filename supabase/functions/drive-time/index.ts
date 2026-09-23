// supabase/functions/drive-time
//
// Real drive time from the user's current location to a flight's departure
// airport, via Google's Routes API (traffic-aware). GOOGLE_ROUTES_API_KEY
// is a server-side secret (`supabase secrets set`), never shipped to the
// app. Airport coordinates reuse the same `airports` cache flight-lookup's
// weather feature populates.
//
// Request:  POST { originLat: number; originLng: number; destinationAirport: string /* IATA */; arriveBy: string /* ISO — when they need to be at the airport, e.g. LiveFlight.boardByEarliest */ }
// Response: { driveMinutes: number; leaveBy: string /* ISO */; distanceKm: number } | { error: string }
//
// Two Routes API calls, not one: a single call only gives duration for
// departing "now" (or duration-at-a-given-departureTime), and there's no
// "arrive by X" mode. So this takes a rough now-traffic estimate first,
// uses it to guess when they'd actually leave, then re-queries with that
// as departureTime to get *predictive* traffic for the real relevant
// window — meaningfully different from "traffic right now" when the
// flight (and so the drive) is hours away.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { aeroApiKey } from "../_shared/aeroapi.ts";
import { fetchAirportCoords } from "../_shared/airports.ts";
import { fetchWithTimeout } from "../_shared/http.ts";
import type { AirportCoords } from "../_shared/types.ts";

const GOOGLE_ROUTES_API_KEY = Deno.env.get("GOOGLE_ROUTES_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface DriveTimeRequest {
  originLat: number;
  originLng: number;
  destinationAirport: string;
  arriveBy: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  if (!GOOGLE_ROUTES_API_KEY) {
    return jsonResponse({ error: "GOOGLE_ROUTES_API_KEY not configured — run `supabase secrets set`." }, 501);
  }
  if (!aeroApiKey()) {
    return jsonResponse({ error: "AEROAPI_KEY not configured — needed for airport coordinates." }, 501);
  }

  let body: DriveTimeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  if (body.originLat == null || body.originLng == null || !body.destinationAirport || !body.arriveBy) {
    return jsonResponse({ error: "originLat, originLng, destinationAirport, and arriveBy are required" }, 400);
  }

  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const dest = await fetchAirportCoords(db, body.destinationAirport);
    if (!dest) return jsonResponse({ error: `No coordinates found for ${body.destinationAirport}` }, 404);

    const origin = { latitude: body.originLat, longitude: body.originLng };

    // Pass 1: rough estimate (current traffic) to guess the real departure window.
    const initial = await computeRoute(origin, dest, null);
    if (!initial) return jsonResponse({ error: "Routes API request failed" }, 502);

    const roughDepart = new Date(new Date(body.arriveBy).getTime() - initial.durationSeconds * 1000).toISOString();

    // Pass 2: predictive traffic at that actual future departure time.
    const refined = (await computeRoute(origin, dest, roughDepart)) ?? initial;

    const leaveBy = new Date(new Date(body.arriveBy).getTime() - refined.durationSeconds * 1000).toISOString();

    return jsonResponse({
      driveMinutes: Math.round(refined.durationSeconds / 60),
      leaveBy,
      distanceKm: Math.round(refined.distanceMeters / 100) / 10,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "drive-time failed", detail: String(err) }, 500);
  }
});

interface RouteResult {
  durationSeconds: number;
  distanceMeters: number;
}

/** Google Routes API (https://developers.google.com/maps/documentation/routes) — traffic-aware. `departureTime: null` means "now"; otherwise predictive traffic for that future time. */
async function computeRoute(origin: AirportCoords, destination: AirportCoords, departureTime: string | null): Promise<RouteResult | null> {
  try {
    const res = await fetchWithTimeout(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_ROUTES_API_KEY!,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: "DRIVE",
          routingPreference: departureTime ? "TRAFFIC_AWARE_OPTIMAL" : "TRAFFIC_AWARE",
          ...(departureTime ? { departureTime } : {}),
        }),
      },
      12000,
    );
    if (!res.ok) {
      console.error("Routes API error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    const seconds = parseInt(String(route.duration).replace("s", ""), 10);
    return { durationSeconds: seconds, distanceMeters: route.distanceMeters };
  } catch (err) {
    console.error("Routes API request failed:", err);
    return null;
  }
}
