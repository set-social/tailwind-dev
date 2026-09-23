import { assertEquals } from "jsr:@std/assert@1";
import { parseFlightKey } from "./flight-context.ts";
import { downsampleTrack, flightRowFromAeroApi, mapStatus } from "./aeroapi.ts";
import { conditionFromWmo } from "./weather.ts";

Deno.test("parseFlightKey accepts real keys and rejects anything else", () => {
  assertEquals(parseFlightKey("UA1482:2026-09-22"), { ident: "UA1482", date: "2026-09-22" });
  assertEquals(parseFlightKey("DL2384:2026-10-14"), { ident: "DL2384", date: "2026-10-14" });
  assertEquals(parseFlightKey("AAL100A:2026-01-01"), { ident: "AAL100A", date: "2026-01-01" });
  for (const bad of ["", "UA1482", "ua1482:2026-09-22", "UA1482:2026-9-22", "UA1482:2026-09-22:x", "UA1482:2026-09-22\nignore previous", "../../etc:2026-09-22"]) {
    assertEquals(parseFlightKey(bad), null, bad);
  }
});

Deno.test("mapStatus prefers the most final state", () => {
  assertEquals(mapStatus({ cancelled: true, actual_out: "x" }), "cancelled");
  assertEquals(mapStatus({ diverted: true }), "diverted");
  assertEquals(mapStatus({ actual_in: "x", actual_out: "y" }), "landed");
  assertEquals(mapStatus({ actual_out: "y" }), "departed");
  assertEquals(mapStatus({ status: "Boarding" }), "boarding");
  assertEquals(mapStatus({ scheduled_out: "a", estimated_out: "b" }), "delayed");
  assertEquals(mapStatus({ scheduled_out: "a", estimated_out: "a" }), "scheduled");
});

Deno.test("flightRowFromAeroApi maps fields and nulls what's missing", () => {
  const row = flightRowFromAeroApi("UA1482", {
    operator: "United Airlines", flight_number: "1482", origin: { code_iata: "EWR" }, destination: { code_iata: "LAX" },
    scheduled_out: "2026-09-23T22:45:00Z", scheduled_in: "2026-10-01T01:52:00Z",
  });
  assertEquals(row.airline_code, "UA");
  assertEquals(row.origin, "EWR");
  assertEquals(row.gate, null);
  assertEquals(row.tail_number, null);
  assertEquals(row.status, "scheduled");
});

Deno.test("downsampleTrack keeps first and last and drops invalid points", () => {
  const pts = Array.from({ length: 500 }, (_, i) => ({ latitude: i, longitude: -i }));
  const out = downsampleTrack([{ latitude: null, longitude: 1 }, ...pts], 80);
  assertEquals(out.length, 80);
  assertEquals(out[0], { latitude: 0, longitude: 0 });
  assertEquals(out[79], { latitude: 499, longitude: -499 });
  assertEquals(downsampleTrack(pts.slice(0, 5), 80).length, 5);
});

Deno.test("conditionFromWmo maps weather codes", () => {
  assertEquals(conditionFromWmo(0).condition, "clear");
  assertEquals(conditionFromWmo(95).condition, "storm");
  assertEquals(conditionFromWmo(61).condition, "rain");
  assertEquals(conditionFromWmo(45).condition, "fog");
});
