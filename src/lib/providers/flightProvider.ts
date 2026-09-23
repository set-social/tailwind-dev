import type { Airport, FlightDetail, InboundInfo, LatLon, LiveFlight, Level, PositionInfo, SearchResult, Trip, WeatherInfo } from "@/lib/types";
import * as mock from "@/lib/data";
import { hasLiveFlightData } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/**
 * Everything a screen needs to know about flights and trips, decoupled
 * from where the data actually comes from. Screens only ever import
 * `flightProvider` from this file's default export — never `lib/data`
 * directly — so swapping mock data for FlightAware AeroAPI / Flightradar24
 * / AeroDataBox later (see the Data & APIs section of the blueprint)
 * touches this file only.
 */
export interface FlightProvider {
  getNextFlight(): FlightDetail;
  getFlightDetail(id: string): FlightDetail | null;
  getTrips(): Trip[];
  getTrip(id: string): Trip | null;
  searchFlights(query: string, date?: string): Promise<SearchResult[]>;
  popularSearches(): string[];
}

class MockFlightProvider implements FlightProvider {
  getNextFlight() {
    return mock.getNextFlight();
  }
  getFlightDetail(id: string) {
    return mock.getFlightDetail(id);
  }
  getTrips() {
    return mock.getTrips();
  }
  getTrip(id: string) {
    return mock.getTrip(id);
  }
  async searchFlights(query: string): Promise<SearchResult[]> {
    return mock.searchFlights(query);
  }
  popularSearches() {
    return mock.popularSearches;
  }
}

/**
 * TODO(live flight data): the `flight-lookup` Supabase Edge Function
 * (supabase/functions/flight-lookup) is live and returns normalized
 * schedule/status/gate/tail data from FlightAware AeroAPI via
 * `supabase.functions.invoke("flight-lookup", { body: { flightNumber, date } })`
 * — AEROAPI_KEY stays server-side, never in this bundle. Search
 * (`LiveSearchFlightProvider` below) and the standalone flight-number
 * lookup (`fetchLiveFlight`, used by LiveFlightScreen) are both real now.
 * What's still missing is composing that (plus OpenSky position, weather,
 * inbound-aircraft rotation) into the full `FlightDetail` shape *this*
 * provider returns — the intelligence signals, leave-by timeline, event
 * feed — which is a decision-engine-sized effort of its own. Until that
 * composition exists, `createFlightProvider` never selects this and it
 * stays unused; a real flight's detail view is LiveFlightScreen instead,
 * which only shows what's actually real.
 */
class RemoteFlightProvider implements FlightProvider {
  getNextFlight(): FlightDetail {
    throw new Error("RemoteFlightProvider not implemented yet — falls back to mock until wired up.");
  }
  getFlightDetail(): FlightDetail | null {
    throw new Error("RemoteFlightProvider not implemented yet.");
  }
  getTrips(): Trip[] {
    throw new Error("RemoteFlightProvider not implemented yet.");
  }
  getTrip(): Trip | null {
    throw new Error("RemoteFlightProvider not implemented yet.");
  }
  async searchFlights(): Promise<SearchResult[]> {
    throw new Error("RemoteFlightProvider not implemented yet.");
  }
  popularSearches(): string[] {
    throw new Error("RemoteFlightProvider not implemented yet.");
  }
}

/**
 * Search only, real when it can be: an exact flight-number query
 * ("UA1482", "UA 1482") goes to the real `flight-lookup` function — live
 * AeroAPI data, cached server-side. Everything else — route/city queries
 * ("EWR to LAX", "Atlanta"), and every *other* method on this class —
 * stays on the mock list/data, either because AeroAPI's single-flight
 * endpoint genuinely can't serve it (route search needs a different,
 * unbuilt endpoint) or because it isn't wired up yet (see
 * RemoteFlightProvider above). Real and mock results for the same flight
 * number are deduped in favor of the real one.
 */
class LiveSearchFlightProvider extends MockFlightProvider {
  async searchFlights(query: string, date?: string): Promise<SearchResult[]> {
    const [live, mockResults] = await Promise.all([lookupLive(query, date), super.searchFlights(query)]);
    if (!live) return mockResults;
    const liveCode = live.code.replace(/\s+/g, "");
    return [live, ...mockResults.filter((r) => r.code.replace(/\s+/g, "") !== liveCode)];
  }
}

const FLIGHT_NUMBER = /^[A-Z]{2,3}\d{1,4}[A-Z]?$/;

/** "UA1482" / "UA 1482" -> "UA1482"; null if the query isn't flight-number-shaped. */
function parseFlightNumber(query: string): string | null {
  const compact = query.replace(/\s+/g, "").toUpperCase();
  return FLIGHT_NUMBER.test(compact) ? compact : null;
}

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * NOT aborted on timeout by design: the underlying request keeps running
 * and still lands in the flights cache table, so a search that felt slow
 * once is fast (server-side cache hit) the next time the same flight comes
 * up — this just stops the UI from waiting on it.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

interface RawAirport {
  code_iata?: string;
  name?: string;
  city?: string;
  timezone?: string;
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
  fetched_at: string;
  // AeroAPI's payload has far more than this, but these are the only
  // extra fields anything here reads — see flight-lookup/index.ts for
  // the full shape actually stored.
  raw?: { origin?: RawAirport; destination?: RawAirport; progress_percent?: number };
}

interface FlightLookupResponse {
  flight: FlightRow;
  originWeather: WeatherInfo | null;
  destinationWeather: WeatherInfo | null;
  inbound: InboundInfo | null;
  position: PositionInfo | null;
  originCoords: LatLon | null;
  destinationCoords: LatLon | null;
}

/** The one place that actually calls the Edge Function — search and LiveFlightScreen both go through this. */
async function fetchFlightLookup(flightNumber: string, date: string, timeoutMs: number): Promise<FlightLookupResponse | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke("flight-lookup", { body: { flightNumber, date } }),
      timeoutMs,
    );
    if (error || !data?.flight) return null;
    return data as FlightLookupResponse;
  } catch {
    return null;
  }
}

async function lookupLive(query: string, date?: string): Promise<SearchResult | null> {
  const ident = parseFlightNumber(query);
  if (!ident) return null;
  const resolvedDate = date ?? todayLocalDate();
  const res = await fetchFlightLookup(ident, resolvedDate, 12000);
  return res ? toSearchResult(res, ident, resolvedDate) : null;
}

/** For LiveFlightScreen — an explicit, user-initiated lookup, so it gets a longer timeout than inline search. */
export async function fetchLiveFlight(flightNumber: string, date: string): Promise<LiveFlight | null> {
  const ident = flightNumber.replace(/\s+/g, "").toUpperCase();
  const res = await fetchFlightLookup(ident, date, 25000);
  return res ? toLiveFlight(res) : null;
}

function tzAbbrev(iana?: string): string {
  if (!iana) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** No boarding-time field exists in AeroAPI's response — this is the standard 30-45-min-before-departure convention airlines generally use, applied to the real estimated (or scheduled) departure. General guidance, not flight-specific data. */
function minusMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() - minutes * 60000).toISOString();
}

function formatLocalTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return "--";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(
      new Date(iso),
    );
  } catch {
    return "--";
  }
}

/** Derived from AeroAPI's own status + schedule-vs-estimate delta — never a fabricated forecast. Exported for LiveFlightScreen's inbound-aircraft card, which needs the same mapping. */
export function outlookFromStatus(status: string, delayMin: number): { level: Level; label: string } {
  switch (status) {
    case "cancelled":
      return { level: "risk", label: "Cancelled" };
    case "diverted":
      return { level: "risk", label: "Diverted" };
    case "landed":
      return { level: "neutral", label: "Landed" };
    case "departed":
      return { level: "neutral", label: "Departed" };
    case "boarding":
      return { level: "good", label: "Boarding" };
    default: {
      if (delayMin <= 0) return { level: "good", label: "On time" };
      const label = delayMin >= 60 ? `Delayed ${Math.floor(delayMin / 60)}h ${delayMin % 60}m` : `Delayed ${delayMin} min`;
      return { level: delayMin >= 45 ? "risk" : delayMin >= 15 ? "watch" : "good", label };
    }
  }
}

function toAirport(raw: RawAirport | undefined, fallbackCode: string): Airport {
  return { code: raw?.code_iata ?? fallbackCode, city: raw?.city ?? "", name: raw?.name ?? "", tz: tzAbbrev(raw?.timezone) };
}

function delayMinutes(row: FlightRow): number {
  return row.estimated_departure && row.scheduled_departure
    ? Math.round((new Date(row.estimated_departure).getTime() - new Date(row.scheduled_departure).getTime()) / 60000)
    : 0;
}

function toSearchResult(res: FlightLookupResponse, ident: string, date: string): SearchResult {
  const row = res.flight;
  const origin = toAirport(row.raw?.origin, row.origin);
  const destination = toAirport(row.raw?.destination, row.destination);

  return {
    id: row.flight_key,
    airline: row.airline_name ?? ident.replace(/\d.*$/, ""),
    code: `${row.airline_code} ${row.flight_number}`,
    origin,
    destination,
    depart: formatLocalTime(row.estimated_departure ?? row.scheduled_departure, row.raw?.origin?.timezone),
    arrive: formatLocalTime(row.estimated_arrival ?? row.scheduled_arrival, row.raw?.destination?.timezone),
    outlook: outlookFromStatus(row.status, delayMinutes(row)),
    // Reusing this slot as the "real data" tag shown in the UI, rather than
    // a fabricated weekly schedule (a single AeroAPI lookup doesn't know that).
    daysLabel: "Live",
    flightNumber: ident,
    date,
    gate: row.gate,
    terminal: row.terminal,
    aircraftType: row.aircraft_type,
  };
}

function toLiveFlight(res: FlightLookupResponse): LiveFlight {
  const row = res.flight;
  const origin = toAirport(row.raw?.origin, row.origin);
  const destination = toAirport(row.raw?.destination, row.destination);
  const departIso = row.estimated_departure ?? row.scheduled_departure;

  return {
    flightKey: row.flight_key,
    airline: row.airline_name ?? row.airline_code,
    code: `${row.airline_code} ${row.flight_number}`,
    origin,
    destination,
    scheduledDepart: formatLocalTime(row.scheduled_departure, row.raw?.origin?.timezone),
    estimatedDepart: formatLocalTime(row.estimated_departure ?? row.scheduled_departure, row.raw?.origin?.timezone),
    scheduledArrive: formatLocalTime(row.scheduled_arrival, row.raw?.destination?.timezone),
    estimatedArrive: formatLocalTime(row.estimated_arrival ?? row.scheduled_arrival, row.raw?.destination?.timezone),
    outlook: outlookFromStatus(row.status, delayMinutes(row)),
    status: row.status,
    delayMinutes: delayMinutes(row),
    gate: row.gate,
    terminal: row.terminal,
    aircraftType: row.aircraft_type,
    tailNumber: row.tail_number,
    fetchedAt: row.fetched_at,
    progressPercent: typeof row.raw?.progress_percent === "number" ? row.raw.progress_percent : null,
    boardByEarliest: formatLocalTime(minusMinutesIso(departIso, 45), row.raw?.origin?.timezone),
    boardByLatest: formatLocalTime(minusMinutesIso(departIso, 30), row.raw?.origin?.timezone),
    boardByEarliestIso: minusMinutesIso(departIso, 45),
    originWeather: res.originWeather,
    destinationWeather: res.destinationWeather,
    inbound: res.inbound,
    position: res.position,
    originCoords: res.originCoords,
    destinationCoords: res.destinationCoords,
  };
}

function createFlightProvider(): FlightProvider {
  return hasLiveFlightData ? new LiveSearchFlightProvider() : new MockFlightProvider();
}

export const flightProvider: FlightProvider = createFlightProvider();
