/** ICAO type designators for aircraft common on US routes. Anything not listed falls back to the raw code. */
const NAMES: Record<string, string> = {
  A19N: "Airbus A319neo", A20N: "Airbus A320neo", A21N: "Airbus A321neo",
  A318: "Airbus A318", A319: "Airbus A319", A320: "Airbus A320", A321: "Airbus A321", A332: "Airbus A330-200", A333: "Airbus A330-300", A339: "Airbus A330-900", A359: "Airbus A350-900", A35K: "Airbus A350-1000", A388: "Airbus A380-800",
  B712: "Boeing 717", B737: "Boeing 737", B738: "Boeing 737-800", B739: "Boeing 737-900", B37M: "Boeing 737 MAX 7", B38M: "Boeing 737 MAX 8", B39M: "Boeing 737 MAX 9", B3XM: "Boeing 737 MAX 10",
  B752: "Boeing 757-200", B753: "Boeing 757-300", B762: "Boeing 767-200", B763: "Boeing 767-300", B764: "Boeing 767-400", B772: "Boeing 777-200", B77L: "Boeing 777-200LR", B77W: "Boeing 777-300ER", B788: "Boeing 787-8", B789: "Boeing 787-9", B78X: "Boeing 787-10",
  CRJ2: "Bombardier CRJ-200", CRJ7: "Bombardier CRJ-700", CRJ9: "Bombardier CRJ-900", CRJX: "Bombardier CRJ-1000",
  E135: "Embraer ERJ-135", E145: "Embraer ERJ-145", E170: "Embraer E170", E75L: "Embraer E175", E75S: "Embraer E175", E190: "Embraer E190", E195: "Embraer E195", E290: "Embraer E190-E2", E295: "Embraer E195-E2",
  BCS1: "Airbus A220-100", BCS3: "Airbus A220-300", DH8D: "De Havilland Dash 8-400", AT72: "ATR 72", MD88: "McDonnell Douglas MD-88", MD90: "McDonnell Douglas MD-90",
};

/** "E75L" -> { name: "Embraer E175", code: "E75L" }; unknown codes keep the code as the name. */
export function aircraftLabel(code: string | null | undefined): { name: string; code: string } | null {
  const c = code?.trim().toUpperCase();
  if (!c) return null;
  return { name: NAMES[c] ?? c, code: c };
}
