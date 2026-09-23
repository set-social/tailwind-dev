import type { LatLon } from "@/lib/types";

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Initial great-circle bearing from `a` to `b`, in degrees clockwise from true north (0–360). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.latitude), φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two headings, 0–180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/**
 * The direction the aircraft is actually pointing, for the map marker.
 *
 * The feed's own heading is used when it's there and plausible. It is
 * cross-checked against the direction of the real flown track (the last
 * stretch of it), because a marker pointing backwards or sideways is worse
 * than one that's a few degrees off: wind drift moves heading vs. ground
 * track by tens of degrees at most, so a disagreement over 90° means the
 * heading value is bad and the track wins. With no heading at all, the
 * track bearing is used. With neither, returns null (draw it unrotated
 * rather than invent a direction).
 */
export function resolveHeading(heading: number | null | undefined, track: LatLon[]): number | null {
  const trackBearing = bearingFromTrack(track);
  const h = typeof heading === "number" && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
  if (h === null) return trackBearing;
  if (trackBearing !== null && angleDiff(h, trackBearing) > 90) return trackBearing;
  return h;
}

/** Bearing along the most recent stretch of the track: from the newest point back to the nearest older point that's meaningfully far away. */
function bearingFromTrack(track: LatLon[]): number | null {
  if (track.length < 2) return null;
  const last = track[track.length - 1];
  for (let i = track.length - 2; i >= 0; i--) {
    const p = track[i];
    // ~0.05° (a few km) apart, so two near-identical fixes don't give a noisy bearing.
    if (Math.abs(p.latitude - last.latitude) + Math.abs(p.longitude - last.longitude) > 0.05) return bearingDegrees(p, last);
  }
  return null;
}
