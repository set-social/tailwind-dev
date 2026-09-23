import type { FlightDetail, Trip } from "../types";
import { ua1482 } from "./flight-ua1482";
import { trips } from "./trips";

export { NOW } from "./flight-ua1482";
export { alerts } from "./alerts";
export { profile } from "./profile";
export { searchFlights, popularSearches } from "./search";
export { answerFor } from "./assistant";
export { AIRPORTS } from "./airports";

/** Data access layer. Swap these for real API calls later; the UI only depends on the types. */
export function getFlightDetail(id: string): FlightDetail | null {
  return id === ua1482.flight.id ? ua1482 : null;
}
export const getNextFlight = () => ua1482;
export const getTrips = (): Trip[] => trips;
export const getTrip = (id: string) => trips.find((x) => x.id === id) ?? null;
