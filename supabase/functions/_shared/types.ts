// Server-side mirrors of the response shapes in src/lib/types.ts (the client's
// single source of truth). Keep the two in step: if a field changes there,
// change it here, and vice versa.

export interface FlightRow {
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
  fetched_at?: string;
  raw?: { inbound_fa_flight_id?: string | null; fa_flight_id?: string | null; [k: string]: unknown };
}

export interface AirportCoords {
  latitude: number;
  longitude: number;
  /** 4-letter code for METAR/TAF lookups. Absent on rows cached before migration 0005. */
  icao?: string | null;
  /** IANA timezone, e.g. "America/New_York". */
  timezone?: string | null;
}

export interface WeatherInfo {
  tempC: number;
  precipitationMm: number;
  windKph: number;
  condition: string; // "clear" | "partly" | "cloud" | "rain" | "storm" | "fog"
  summary: string;
  forTime: string; // ISO — the hourly slot this actually describes
}

export interface InboundInfo {
  code: string; // "UA 1845"
  origin: string;
  destination: string;
  status: string;
  scheduledArrival: string;
  estimatedArrival: string | null;
  delayMinutes: number;
  /** When the inbound aircraft leaves ITS origin — weather there can delay this flight's aircraft before it ever reaches us. */
  scheduledDeparture?: string | null;
  estimatedDeparture?: string | null;
}

export interface PositionInfo {
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundspeedKts: number;
  heading: number | null;
  timestamp: string;
  /** The real flown path so far (downsampled), oldest first. */
  track: { latitude: number; longitude: number }[];
}

/** Everything flight-lookup returns, and everything the assistant's context is built from. */
export interface FlightLookupResult {
  flight: FlightRow;
  cached: boolean;
  originWeather: WeatherInfo | null;
  destinationWeather: WeatherInfo | null;
  inbound: InboundInfo | null;
  position: PositionInfo | null;
  originCoords: AirportCoords | null;
  destinationCoords: AirportCoords | null;
}

/** Mirrors AssistantAnswer in src/lib/data/assistant.ts. */
export interface AssistantAnswer {
  answer: string[];
  basedOn: string[];
  follow?: string;
}

// ─── weather intelligence ────────────────────────────────────────────────
// Mirrors the "Weather intelligence" block in src/lib/types.ts.

export type WxLevel = "good" | "watch" | "risk" | "neutral";
export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

/** Conditions at one moment, from whichever source covers it best: TAF (aviation forecast), METAR (observed), or the model forecast. */
export interface WxConditions {
  atIso: string;
  atLocal: string;
  source: "TAF" | "METAR" | "Forecast";
  windDirDeg: number | null;
  windDirName: string | null;
  windKt: number | null;
  gustKt: number | null;
  visibilityMi: number | null;
  ceilingFt: number | null;
  flightCategory: FlightCategory | null;
  precipMmHr: number | null;
  tempC: number | null;
  summary: string;
}

/** One deterministic finding, with the real numbers and times baked into `detail`. */
export interface WxFactor {
  id: "wind" | "visibility" | "precipitation" | "icing" | "alert" | "pattern" | "trend";
  level: WxLevel;
  title: string;
  detail: string;
}

export interface WxAlert {
  event: string;
  severity: string;
  headline: string;
  onsetIso: string | null;
  endsIso: string | null;
  /** Truncated NWS free text. Untrusted: treated as data everywhere it's used. */
  description: string;
}

export interface WxDay {
  label: string; // "Fri, Sep 25"
  peakGustKt: number;
  peakWindKt: number;
  peakGustLocal: string; // "3 PM"
  dominantDir: string | null; // "NE"
  precipMm: number;
}

export interface AirportWeatherAssessment {
  airport: string;
  role: "departure" | "arrival" | "inbound_departure";
  timezone: string | null;
  focusIso: string;
  focusLabel: string; // "Arrives 6:53 PM EDT"
  level: WxLevel;
  /** False when no source covers this airport/time (e.g. a flight more than ~a week out). */
  dataAvailable: boolean;
  conditions: WxConditions | null;
  observedNow: WxConditions | null;
  factors: WxFactor[];
  alerts: WxAlert[];
  daily: WxDay[];
  /** 3-hourly wind/gust around the flight, for the chart. */
  chart: { t: string; windKt: number; gustKt: number }[];
  sources: string[];
}

export interface WeatherNarrative {
  headline: string;
  insights: string[];
  recommendations: { action: string; why: string }[];
}

export interface WeatherInsights {
  flightKey: string;
  generatedAt: string;
  level: WxLevel;
  /** Deterministic one-liner, always present — the fallback when `narrative` is null. */
  summaryLine: string;
  departure: AirportWeatherAssessment;
  arrival: AirportWeatherAssessment;
  inbound: AirportWeatherAssessment | null;
  narrative: WeatherNarrative | null;
  /** Why there's no narrative, when there isn't one worth explaining ("calm", "limit", "unavailable"). */
  narrativeStatus: "ai" | "calm" | "limit" | "unavailable";
}
