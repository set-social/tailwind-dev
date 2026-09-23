// Assembles the weather picture for one flight: the departure airport around
// its departure time, the arrival airport around its arrival time, and — when
// the aircraft is coming from somewhere else first — the airport it departs
// before it ever reaches us. Deterministic; no model involved. See
// wx-assess.ts for the rules and wx-narrative.ts for the AI layer on top.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAirportCoords } from "./airports.ts";
import type { AirportCoords, AirportWeatherAssessment, FlightLookupResult, WxLevel } from "./types.ts";
import { assessAirport, fmtTime } from "./wx-assess.ts";
import { fetchAlerts, fetchMetar, fetchTaf, forecastSeries, icaoFor } from "./wx-sources.ts";

export interface FlightWeather {
  departure: AirportWeatherAssessment;
  arrival: AirportWeatherAssessment;
  inbound: AirportWeatherAssessment | null;
}

const HOUR = 3_600_000;

async function ingredients(db: SupabaseClient, iata: string, coords: AirportCoords | null) {
  if (!coords) return { series: null, metar: null, taf: null, alerts: [] };
  const icao = icaoFor(iata, coords);
  const [series, metar, taf, alerts] = await Promise.all([
    forecastSeries(db, iata, coords),
    icao ? fetchMetar(db, icao) : Promise.resolve(null),
    icao ? fetchTaf(db, icao) : Promise.resolve(null),
    fetchAlerts(db, iata, coords),
  ]);
  return { series, metar, taf, alerts };
}

/** Never throws: a failed source just means that airport has less (or no) data. */
export async function buildFlightWeather(db: SupabaseClient, r: FlightLookupResult, nowMs = Date.now()): Promise<FlightWeather> {
  const f = r.flight;
  const raw = f.raw as { origin?: { timezone?: string }; destination?: { timezone?: string } } | undefined;
  const memo = new Map<string, ReturnType<typeof ingredients>>();
  const get = (iata: string, c: AirportCoords | null) => {
    if (!memo.has(iata)) memo.set(iata, ingredients(db, iata, c).catch((err) => { console.error(`weather ingredients failed for ${iata}:`, err); return { series: null, metar: null, taf: null, alerts: [] }; }));
    return memo.get(iata)!;
  };

  const one = async (
    iata: string, coords: AirportCoords | null, tz: string | null | undefined,
    role: AirportWeatherAssessment["role"], focusIso: string, focusVerb: string,
  ): Promise<AirportWeatherAssessment> => {
    const ing = await get(iata, coords);
    return assessAirport({
      airport: iata, role, timezone: tz ?? coords?.timezone ?? null, focusIso, focusVerb, nowMs,
      lat: coords?.latitude ?? null, lon: coords?.longitude ?? null, ...ing,
    });
  };

  const depIso = f.estimated_departure ?? f.scheduled_departure;
  const arrIso = f.estimated_arrival ?? f.scheduled_arrival;

  const inb = r.inbound;
  const inbIso = inb?.estimatedDeparture ?? inb?.scheduledDeparture ?? null;
  // The aircraft's earlier leg only matters if it hasn't left yet (or only just has).
  const inboundRelevant = inb && inbIso && Date.parse(inbIso) > nowMs - HOUR && inb.origin && inb.origin !== "?";

  const [departure, arrival, inbound] = await Promise.all([
    one(f.origin, r.originCoords, raw?.origin?.timezone, "departure", depIso, "Departs"),
    one(f.destination, r.destinationCoords, raw?.destination?.timezone, "arrival", arrIso, "Arrives"),
    inboundRelevant
      ? fetchAirportCoords(db, inb.origin).then((c) => one(inb.origin, c, undefined, "inbound_departure", inbIso!, `${inb.code} departs`))
      : Promise.resolve(null),
  ]);
  return { departure, arrival, inbound };
}

// ─── deterministic summary ───────────────────────────────────────────────

const RANK: Record<WxLevel, number> = { risk: 2, watch: 1, good: 0, neutral: 0 };

export function overallLevel(w: FlightWeather): WxLevel {
  const levels = [w.departure, w.arrival, w.inbound].filter((a): a is AirportWeatherAssessment => !!a && a.dataAvailable).map((a) => a.level);
  return levels.includes("risk") ? "risk" : levels.includes("watch") ? "watch" : "good";
}

/** True when there's something worth a model's words: a watch/risk finding, or an NWS alert. */
export function hasNotableWeather(w: FlightWeather): boolean {
  return [w.departure, w.arrival, w.inbound].some((a) => a && a.dataAvailable && (a.level !== "good" || a.alerts.length > 0));
}

const AT: Record<AirportWeatherAssessment["role"], string> = {
  arrival: "arrival",
  departure: "departure",
  inbound_departure: "aircraft's earlier departure",
};

/** One line, built from the findings themselves — always available, even with no model. */
export function summaryLine(w: FlightWeather): string {
  const all = [w.arrival, w.departure, w.inbound].filter((a): a is AirportWeatherAssessment => !!a && a.dataAvailable);
  if (!all.length) return "A weather outlook isn't available for this flight yet.";
  let best: { a: AirportWeatherAssessment; title: string; level: WxLevel } | null = null;
  for (const a of all) {
    for (const f of a.factors) {
      if (RANK[f.level] === 0 || f.id === "trend") continue;
      if (!best || RANK[f.level] > RANK[best.level]) best = { a, title: f.title, level: f.level };
    }
  }
  if (!best) {
    const airports = [...new Set([w.departure, w.arrival].filter((a) => a.dataAvailable).map((a) => a.airport))];
    return `Weather looks calm at ${airports.join(" and ")} for your flight.`;
  }
  return `${best.title} at ${best.a.airport} around your ${fmtTime(Date.parse(best.a.focusIso), best.a.timezone)} ${AT[best.a.role]}.`;
}
