import { angleDiff, bearingDegrees, resolveHeading } from "@/lib/geo";

const p = (latitude: number, longitude: number) => ({ latitude, longitude });

test("bearings point the right way", () => {
  expect(bearingDegrees(p(0, 0), p(1, 0))).toBeCloseTo(0, 5); // north
  expect(bearingDegrees(p(0, 0), p(0, 1))).toBeCloseTo(90, 5); // east
  expect(bearingDegrees(p(0, 0), p(-1, 0))).toBeCloseTo(180, 5); // south
  expect(bearingDegrees(p(0, 0), p(0, -1))).toBeCloseTo(270, 5); // west
});

test("angleDiff wraps around north", () => {
  expect(angleDiff(350, 10)).toBe(20);
  expect(angleDiff(10, 350)).toBe(20);
  expect(angleDiff(90, 270)).toBe(180);
});

// A New York -> Athens style leg: heads north-east out of the US.
const northEast = [p(40.6, -74.2), p(42.0, -70.5), p(44.0, -66.0)];

test("a sane feed heading is used as-is", () => {
  expect(resolveHeading(55, northEast)).toBe(55);
  expect(resolveHeading(-305, northEast)).toBe(55); // normalized
});

test("a heading that contradicts the flown track is rejected in favour of the track", () => {
  const h = resolveHeading(235, northEast)!; // exactly backwards
  expect(angleDiff(h, 55)).toBeLessThan(15);
});

test("no heading: falls back to the track; no track either: null, not a guess", () => {
  expect(angleDiff(resolveHeading(null, northEast)!, 55)).toBeLessThan(15);
  expect(resolveHeading(null, [])).toBeNull();
  expect(resolveHeading(undefined, [p(1, 1)])).toBeNull();
  expect(resolveHeading(NaN, [p(1, 1), p(1, 1)])).toBeNull(); // identical fixes: no direction to speak of
  expect(resolveHeading(90, [])).toBe(90); // heading alone is trusted when there's nothing to check it against
});
