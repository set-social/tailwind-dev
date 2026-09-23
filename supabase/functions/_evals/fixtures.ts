// Fixture flights for testing and evaluating the assistant. Each is a real-
// shaped FlightLookupResult, so the same object feeds the deterministic tests
// today (assistant-core.test.ts) and the model-run evals once the tool-using
// agent lands in Phase 1. `expect` records what a correct answer must be
// built from, so an eval can check "cites the right signals, invents no
// numbers, admits missing data" without a human reading every reply.

import type { FlightLookupResult, FlightRow } from "../_shared/types.ts";

const base: FlightRow = {
  flight_key: "UA1482:2026-09-23",
  airline_code: "UA",
  airline_name: "United Airlines",
  flight_number: "1482",
  origin: "EWR",
  destination: "LAX",
  scheduled_departure: "2026-09-23T22:45:00Z", // 6:45 PM EDT
  estimated_departure: "2026-09-23T22:45:00Z",
  actual_departure: null,
  scheduled_arrival: "2026-10-01T01:52:00Z",
  estimated_arrival: "2026-10-01T01:52:00Z",
  actual_arrival: null,
  status: "scheduled",
  gate: "C74",
  terminal: "C",
  aircraft_type: "B39M",
  tail_number: "N17264",
  source: "aeroapi",
  fetched_at: "2026-09-23T19:00:00Z",
  raw: { origin: { timezone: "America/New_York" }, destination: { timezone: "America/Los_Angeles" } } as FlightRow["raw"],
};

type Override = Omit<Partial<FlightLookupResult>, "flight"> & { flight?: Partial<FlightRow> };

const result = ({ flight, ...rest }: Override = {}): FlightLookupResult => ({
  flight: { ...base, ...flight },
  cached: false,
  originWeather: null,
  destinationWeather: null,
  inbound: null,
  position: null,
  originCoords: null,
  destinationCoords: null,
  ...rest,
});

export interface Fixture {
  name: string;
  data: FlightLookupResult;
  /** Evidence labels a correct answer may cite (and the only ones it can). */
  expectSources: string[];
  /** Phrases that would mean the assistant invented a number it was never given. */
  mustNotContain: RegExp[];
}

const NO_PROBABILITIES = [/\b\d{1,3}\s?%/, /\b\d{1,3}\s?percent\b/i, /\bchance\b.*\b\d/i, /\bodds\b/i];

export const fixtures: Fixture[] = [
  {
    name: "on time, nothing else known",
    data: result(),
    expectSources: ["Flight status"],
    mustNotContain: NO_PROBABILITIES,
  },
  {
    name: "inbound aircraft running late",
    data: result({
      flight: { status: "delayed", estimated_departure: "2026-09-23T23:25:00Z" },
      inbound: {
        code: "UA 1845", origin: "ORD", destination: "EWR", status: "departed",
        scheduledArrival: "2026-09-23T21:20:00Z", estimatedArrival: "2026-09-23T21:58:00Z", delayMinutes: 38,
      },
      originWeather: {
        tempC: 24, precipitationMm: 4.2, windKph: 30, condition: "storm", summary: "Thunderstorms", forTime: "2026-09-23T22:00:00Z",
      },
    }),
    expectSources: ["Flight status", "Weather at EWR", "Inbound aircraft UA 1845"],
    mustNotContain: NO_PROBABILITIES,
  },
  {
    name: "cancelled",
    data: result({ flight: { status: "cancelled", estimated_departure: null, estimated_arrival: null, gate: null } }),
    expectSources: ["Flight status"],
    mustNotContain: NO_PROBABILITIES,
  },
  {
    name: "missing data: schedule only, weeks out",
    data: result({
      flight: {
        source: "aeroapi-schedule", estimated_departure: null, estimated_arrival: null, gate: null, terminal: null,
        aircraft_type: null, tail_number: null, scheduled_departure: "2026-10-20T22:45:00Z", flight_key: "UA1482:2026-10-20",
      },
    }),
    expectSources: ["Flight status"],
    mustNotContain: NO_PROBABILITIES,
  },
];
