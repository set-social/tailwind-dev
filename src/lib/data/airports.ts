import type { Airport } from "../types";

export const AIRPORTS: Record<string, Airport> = {
  EWR: { code: "EWR", city: "Newark", name: "Newark Liberty Intl", tz: "ET" },
  LAX: { code: "LAX", city: "Los Angeles", name: "Los Angeles Intl", tz: "PT" },
  ATL: { code: "ATL", city: "Atlanta", name: "Hartsfield–Jackson", tz: "ET" },
  SFO: { code: "SFO", city: "San Francisco", name: "San Francisco Intl", tz: "PT" },
  ORD: { code: "ORD", city: "Chicago", name: "O'Hare Intl", tz: "CT" },
  BOS: { code: "BOS", city: "Boston", name: "Logan Intl", tz: "ET" },
  DEN: { code: "DEN", city: "Denver", name: "Denver Intl", tz: "MT" },
  SEA: { code: "SEA", city: "Seattle", name: "Seattle–Tacoma", tz: "PT" },
  MIA: { code: "MIA", city: "Miami", name: "Miami Intl", tz: "ET" },
  JFK: { code: "JFK", city: "New York", name: "John F. Kennedy", tz: "ET" },
  LGA: { code: "LGA", city: "New York", name: "LaGuardia", tz: "ET" },
  SAN: { code: "SAN", city: "San Diego", name: "San Diego Intl", tz: "PT" },
};
