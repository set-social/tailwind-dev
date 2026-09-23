export type Level = "good" | "watch" | "risk" | "neutral";
export type Condition = "clear" | "partly" | "cloud" | "rain" | "storm" | "fog";

export interface Airport {
  code: string;
  city: string;
  name: string;
  tz: string; // display label, e.g. "ET"
}

export interface StageState {
  id: "scheduled" | "inbound" | "gate" | "boarding" | "departed" | "inflight" | "landed";
  label: string;
  state: "done" | "current" | "upcoming";
  note?: string;
}

export interface Flight {
  id: string;
  airline: string;
  code: string; // "UA 1482"
  date: string; // "Today · Sun, Sep 20"
  origin: Airport;
  destination: Airport;
  depart: number; // minutes after midnight, local
  arrive: number;
  durationMin: number;
  boardingStart: number;
  terminal: string;
  gate: string;
  aircraft: string;
  airlineStatus: { label: string; level: Level; detail: string };
  forecast: {
    probability: number; // P(delay >= thresholdMin)
    thresholdMin: number;
    label: string;
    level: Level;
    confidence: "Low" | "Medium" | "High";
    /** probability by expected departure delay bucket — sums to 100 */
    distribution: { label: string; pct: number }[];
    likelyDeparture: { from: number; to: number };
    trend: number[]; // history of probability through the day
  };
  stages: StageState[];
}

export interface Signal {
  id: string;
  icon: "plane" | "cloud" | "building" | "history" | "swap";
  label: string;
  value: string;
  detail: string;
  level: Level;
  /** how much this signal moves the forecast, 0–100 */
  weight: number;
}

export interface Intelligence {
  headline: string;
  summary: string;
  updatedAt: number;
  signals: Signal[];
  suggested: string[];
}

export interface InboundAircraft {
  type: string;
  tail: string;
  operating: { code: string; from: string; to: string; fromCity: string };
  position: string;
  altitudeFt: number;
  groundSpeedKts: number;
  progress: number; // 0–1 along the route
  departedLate: number;
  scheduledArrival: number;
  estimatedArrival: number;
  scheduledTurnaround: number; // min
  estimatedTurnaround: number; // min available
  requiredTurnaround: number; // min a normal turn takes
  verdict: { level: Level; title: string; detail: string };
  swap: {
    probability: number;
    tail: string;
    type: string;
    location: string;
    detail: string;
  };
}

export interface LeaveComponent {
  id: string;
  label: string;
  minutes: number;
  note: string;
  icon: "car" | "parking" | "shield" | "walk" | "buffer";
}

export interface LeaveScenario {
  id: string;
  label: string;
  delayMin: number;
  hint: string;
}

export interface LeaveInputs {
  components: LeaveComponent[];
  scenarios: LeaveScenario[];
  originLabel: string;
}

export interface WeatherHour {
  label: string;
  temp: number;
  condition: Condition;
  precip: number;
}

export interface AirportWeather {
  code: string;
  city: string;
  focusLabel: string;
  temp: number;
  condition: Condition;
  summary: string;
  hours: WeatherHour[];
  operational?: { level: Level; title: string; detail: string };
}

export interface FlightEvent {
  id: string;
  time: number;
  kind: "aircraft" | "risk" | "weather" | "gate" | "status";
  title: string;
  detail?: string;
  delta?: { from: number; to: number };
}

export interface FlightDetail {
  flight: Flight;
  intelligence: Intelligence;
  aircraft: InboundAircraft;
  leave: LeaveInputs;
  weather: { origin: AirportWeather; destination: AirportWeather };
  events: FlightEvent[];
}

export interface TripLeg {
  code: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  depart: number;
  arrive: number;
  aircraft: string;
  terminal?: string;
  gate?: string;
  status: { label: string; level: Level };
}

export interface Connection {
  airport: string;
  scheduledMin: number;
  expectedMin: number;
  walkMin: number;
  gateFrom: string;
  gateTo: string;
  risk: number; // % chance of missing
  level: Level;
  advice: string;
}

export interface Trip {
  id: string;
  title: string;
  dateLabel: string;
  daysAway: number;
  legs: TripLeg[];
  connections: Connection[];
  flightId?: string; // link into flight detail when available
  outlook: { level: Level; label: string };
}

export interface Alert {
  id: string;
  time: string;
  kind: "delay" | "leave" | "gate" | "connection" | "weather" | "good";
  level: Level;
  title: string;
  body: string;
  tripLabel: string;
  action?: { label: string; href: string };
  unread?: boolean;
}

export interface SearchResult {
  id: string;
  airline: string;
  code: string;
  origin: Airport;
  destination: Airport;
  depart: string;
  arrive: string;
  /** Historical on-time rate. Only known for the mock/demo list — omit rather than fabricate it for a real lookup. */
  onTimePct?: number;
  outlook: { level: Level; label: string };
  daysLabel: string;
  /** Set only on a real (live, AeroAPI-backed) result — used to open LiveFlightScreen and to show gate/terminal/aircraft inline. Absent for the mock/demo list. */
  flightNumber?: string;
  date?: string;
  gate?: string | null;
  terminal?: string | null;
  aircraftType?: string | null;
  // No position/mapImage here — the tracker map lives on the flight detail
  // view (LiveFlight type), not the search results list; see LiveFlightView.
}

/** Real, from AeroAPI's /flights/{id}/track — the aircraft's own most recent reported position. */
export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface PositionInfo extends LatLon {
  altitudeFt: number;
  groundspeedKts: number;
  heading: number | null;
  timestamp: string;
  /** The real flown path so far (downsampled server-side), oldest first — not a straight line. */
  track: LatLon[];
}

/** Real, from Open-Meteo (free, keyless) — the hourly slot nearest the flight's own departure/arrival time, not just "right now". */
export interface WeatherInfo {
  tempC: number;
  precipitationMm: number;
  windKph: number;
  condition: Condition;
  summary: string;
  forTime: string;
}

/** The real inbound aircraft's own flight (AeroAPI gives its id directly) — real status, not a swap-risk guess. */
export interface InboundInfo {
  code: string;
  origin: string;
  destination: string;
  status: string;
  scheduledArrival: string;
  estimatedArrival: string | null;
  delayMinutes: number;
}

/**
 * A real flight, as returned by the `flight-lookup` Edge Function —
 * schedule/status/gate, real weather at both airports, and the real
 * inbound aircraft's own status. Deliberately does NOT carry the
 * predictive fields `FlightDetail` has (delay-probability forecast,
 * aircraft-swap-risk %, a personalized leave-by plan): there's no real
 * predictive model behind the first two, and AeroAPI has no boarding-time
 * field to compute the third from honestly — so a live flight simply
 * doesn't have them, rather than showing fabricated numbers next to
 * genuinely real ones.
 */
export interface LiveFlight {
  flightKey: string;
  airline: string;
  code: string;
  origin: Airport;
  destination: Airport;
  scheduledDepart: string;
  estimatedDepart: string;
  scheduledArrive: string;
  estimatedArrive: string;
  outlook: { level: Level; label: string };
  /** AeroAPI's raw status ("scheduled" | "delayed" | "boarding" | "departed" | "landed" | "cancelled" | "diverted") — separate from `outlook.label` (a display string) so UI logic like "is this flight actually en route" doesn't have to string-match a label. */
  status: string;
  /** Estimated-minus-scheduled departure, in minutes (0 if on time or unknown) — the same number outlook.label is derived from, exposed directly for the risk-factors panel. */
  delayMinutes: number;
  gate: string | null;
  terminal: string | null;
  aircraftType: string | null;
  tailNumber: string | null;
  fetchedAt: string;
  /** AeroAPI's own progress_percent (0-100) along the route — real, not estimated client-side. Null when AeroAPI doesn't report it (e.g. before departure). */
  progressPercent: number | null;
  /** Real estimated/scheduled departure minus the standard 30-45-min boarding convention — a documented industry guideline, not this-flight-specific data (AeroAPI has no boarding-time field). */
  boardByEarliest: string;
  boardByLatest: string;
  /** Same as boardByEarliest, as a raw ISO instant — for feeding into drive-time (an "arrive by" target), not for display. */
  boardByEarliestIso: string;
  originWeather: WeatherInfo | null;
  destinationWeather: WeatherInfo | null;
  inbound: InboundInfo | null;
  /** Real, live, from AeroAPI's flight track (includes the real flown path, not a straight line) — set only while the flight is actually en route. */
  position: PositionInfo | null;
  /** Real airport coordinates (AeroAPI, cached) — for the map's bounds and its remaining-path line. */
  originCoords: LatLon | null;
  destinationCoords: LatLon | null;
}

/** Real, from Google's Routes API (traffic-aware, predictive for the actual departure window) — the drive from the device's current location to the departure airport. */
export interface DriveTimeInfo {
  driveMinutes: number;
  leaveBy: string;
  distanceKm: number;
}

export type TempUnit = "F" | "C";

export interface Profile {
  name: string;
  homeAirport: string;
  arrivalBuffer: number;
  preCheck: boolean;
  clear: boolean;
  checkedBags: number;
  transport: "drive" | "rideshare" | "transit";
  notifications: { id: string; label: string; description: string; enabled: boolean }[];
  /** Defaults to "F" for every account — see the temp_unit column default in the migration. */
  tempUnit: TempUnit;
}
