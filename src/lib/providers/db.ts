import { relativeDay } from "@/lib/dayLabel";
import { supabase } from "@/lib/supabase";
import { hasDatabase } from "@/lib/config";
import type { Alert, Profile } from "@/lib/types";

/**
 * Real persistence for the three things nothing else here needs a full
 * provider abstraction for (see supabase/migrations/0001_init.sql):
 * profile, tracked trips, and alert read-state. Screens still read mock
 * data directly today (src/lib/data) — nothing calls these yet; wiring a
 * screen to real data means swapping its mock import for the matching
 * function below.
 *
 * Every function requires a signed-in Supabase session (RLS is keyed on
 * auth.uid()) and throws loudly — same "fail loud, don't silently no-op"
 * rule as before — rather than falling back to demo data, since there's no
 * sign-in UI yet for it to fall back *to*. That's the next real gap here.
 */

function requireDb() {
  if (!supabase) throw new Error("No database configured — set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  return supabase;
}

async function requireUserId(): Promise<string> {
  const db = requireDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Sign-in required — no active Supabase session.");
  return data.user.id;
}

interface ProfileRow {
  id: string;
  name: string;
  home_airport: string | null;
  arrival_buffer_minutes: number;
  tsa_precheck: boolean;
  clear: boolean;
  checked_bags: number;
  transport: Profile["transport"];
  notification_prefs: Profile["notifications"];
  temp_unit: Profile["tempUnit"];
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    name: row.name,
    homeAirport: row.home_airport ?? "",
    arrivalBuffer: row.arrival_buffer_minutes,
    preCheck: row.tsa_precheck,
    clear: row.clear,
    checkedBags: row.checked_bags,
    transport: row.transport,
    notifications: row.notification_prefs,
    tempUnit: row.temp_unit,
  };
}

export async function fetchProfile(): Promise<Profile> {
  const db = requireDb();
  const userId = await requireUserId();
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return rowToProfile(data as ProfileRow);
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const db = requireDb();
  const userId = await requireUserId();
  const row: Partial<ProfileRow> = {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.homeAirport !== undefined && { home_airport: patch.homeAirport }),
    ...(patch.arrivalBuffer !== undefined && { arrival_buffer_minutes: patch.arrivalBuffer }),
    ...(patch.preCheck !== undefined && { tsa_precheck: patch.preCheck }),
    ...(patch.clear !== undefined && { clear: patch.clear }),
    ...(patch.checkedBags !== undefined && { checked_bags: patch.checkedBags }),
    ...(patch.transport !== undefined && { transport: patch.transport }),
    ...(patch.notifications !== undefined && { notification_prefs: patch.notifications }),
    ...(patch.tempUnit !== undefined && { temp_unit: patch.tempUnit }),
  };
  const { error } = await db.from("profiles").update(row).eq("id", userId);
  if (error) throw error;
}

interface AlertRow {
  id: string;
  kind: Alert["kind"];
  level: Alert["level"];
  title: string;
  body: string;
  trip_label: string | null;
  action_label: string | null;
  action_href: string | null;
  unread: boolean;
  created_at: string;
}

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    time: row.created_at,
    kind: row.kind,
    level: row.level,
    title: row.title,
    body: row.body,
    tripLabel: row.trip_label ?? "",
    action: row.action_label && row.action_href ? { label: row.action_label, href: row.action_href } : undefined,
    unread: row.unread,
  };
}

export async function fetchAlerts(): Promise<Alert[]> {
  const db = requireDb();
  const userId = await requireUserId();
  const { data, error } = await db
    .from("alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as AlertRow[]).map(rowToAlert);
}

export async function markAlertRead(id: string): Promise<void> {
  const db = requireDb();
  const userId = await requireUserId();
  const { error } = await db.from("alerts").update({ unread: false }).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/** Tracks a flight already cached in `flights` (see flight-lookup Edge Function) against the signed-in user. */
export async function trackTrip(flightKey: string, title?: string): Promise<void> {
  const db = requireDb();
  const userId = await requireUserId();
  const { error } = await db.from("tracked_trips").upsert(
    { user_id: userId, flight_key: flightKey, title: title ?? null },
    { onConflict: "user_id,flight_key" },
  );
  if (error) throw error;
}

export async function untrackTrip(flightKey: string): Promise<void> {
  const db = requireDb();
  const userId = await requireUserId();
  const { error } = await db.from("tracked_trips").delete().eq("user_id", userId).eq("flight_key", flightKey);
  if (error) throw error;
}

interface TrackedFlightSummary {
  flight_key: string;
  airline_code: string;
  flight_number: string;
  origin: string;
  destination: string;
  scheduled_departure: string;
  estimated_departure: string | null;
  scheduled_arrival: string;
  estimated_arrival: string | null;
  gate: string | null;
  terminal: string | null;
  status: string;
  /** IANA timezones of the two airports, pulled out of the cached AeroAPI payload (raw->origin->>timezone). */
  origin_tz: string | null;
  dest_tz: string | null;
}

interface TrackedTripRow {
  id: string;
  flight_key: string;
  created_at: string;
  flights: TrackedFlightSummary | null; // embedded via the flight_key FK
}

/**
 * A tracked trip, real: route/status come from the `flights` cache row
 * (embedded via its FK), not a fabricated itinerary. Deliberately lighter
 * than the old mock `Trip` type (no connections, no outlook narrative) —
 * there's no real data behind that yet.
 */
export interface TrackedTrip {
  id: string;
  flightKey: string;
  flightNumber: string;
  date: string;
  code: string;
  origin: string;
  destination: string;
  departLocal: string;
  /** Estimated (else scheduled) departure as an ISO instant — for the Home hero's big time and countdown. */
  departIso: string | null;
  /** Estimated (else scheduled) arrival as an ISO instant — for the hero's flight duration. */
  arriveIso: string | null;
  gate: string | null;
  terminal: string | null;
  /** Departure / arrival airport timezones, so times show as the airport's own local time, not the phone's. */
  originTz: string | null;
  destTz: string | null;
  status: string;
  delayMinutes: number;
}

/** "Sep 24, 2:53 PM CDT" — in the airport's own timezone when known (falls back to the phone's). */
/** "Tomorrow, 2:53 PM CDT" / "Thu, Sep 26, 2:53 PM CDT" — the day is judged at the airport. */
function formatAirportTime(iso: string, tz: string | null): string {
  const day = relativeDay(iso, tz);
  try {
    const time = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(tz ? { timeZone: tz } : {}) });
    return day ? `${day.label}, ${time}` : time;
  } catch {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

function rowToTrackedTrip(row: TrackedTripRow): TrackedTrip {
  const f = row.flights;
  const [flightNumber, date] = row.flight_key.split(":");
  const delayMinutes =
    f?.estimated_departure && f?.scheduled_departure
      ? Math.max(0, Math.round((new Date(f.estimated_departure).getTime() - new Date(f.scheduled_departure).getTime()) / 60000))
      : 0;
  return {
    id: row.id,
    flightKey: row.flight_key,
    flightNumber,
    date,
    code: f ? `${f.airline_code} ${f.flight_number}` : row.flight_key,
    origin: f?.origin ?? "?",
    destination: f?.destination ?? "?",
    departLocal: f ? formatAirportTime(f.estimated_departure ?? f.scheduled_departure, f.origin_tz) : "",
    departIso: f ? f.estimated_departure ?? f.scheduled_departure : null,
    arriveIso: f ? f.estimated_arrival ?? f.scheduled_arrival : null,
    gate: f?.gate ?? null,
    terminal: f?.terminal ?? null,
    originTz: f?.origin_tz ?? null,
    destTz: f?.dest_tz ?? null,
    status: f?.status ?? "unknown",
    delayMinutes,
  };
}

export async function fetchTrips(): Promise<TrackedTrip[]> {
  const db = requireDb();
  const userId = await requireUserId();
  const { data, error } = await db
    .from("tracked_trips")
    .select("id, flight_key, created_at, flights(flight_key, airline_code, flight_number, origin, destination, scheduled_departure, estimated_departure, scheduled_arrival, estimated_arrival, gate, terminal, status, origin_tz:raw->origin->>timezone, dest_tz:raw->destination->>timezone)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as TrackedTripRow[]).map(rowToTrackedTrip);
}

export { hasDatabase };
