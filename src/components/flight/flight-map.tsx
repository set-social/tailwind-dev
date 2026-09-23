import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { LatLon, PositionInfo } from "@/lib/types";
import { c } from "@/theme";
import { AirplaneGlyph } from "@/components/route-plane-icon";
import { resolveHeading } from "@/lib/geo";

/**
 * A real, interactive tracker map — react-native-maps (Apple Maps on iOS,
 * no API key needed; `userInterfaceStyle="dark"` gives Apple's own native
 * dark theme, since Apple Maps doesn't support the custom JSON styling
 * Google Maps does). Replaces an earlier static-image version: a picture
 * can't pan/zoom and can only ever show a straight line between two
 * points, not where the aircraft actually flew — this uses the real
 * downsampled track from AeroAPI for that, a solid line; the remaining
 * leg to the destination is a dashed straight-line estimate, visually
 * distinct from the real flown path.
 */
export function FlightMap({
  position,
  originCoords,
  destinationCoords,
}: {
  position: PositionInfo;
  originCoords: LatLon | null;
  destinationCoords: LatLon | null;
}) {
  const track = position.track.length > 0 ? position.track : [{ latitude: position.latitude, longitude: position.longitude }];

  const heading = useMemo(() => resolveHeading(position.heading, track), [position.heading, track]);

  // Apple Maps turns a marker's children into a bitmap. Snapshotting before
  // the SVG has drawn gives an empty marker, so let it track changes for the
  // first moments after mount, then freeze it (cheaper) — rotation and
  // position updates are native props and don't need a re-snapshot.
  const [snapshotting, setSnapshotting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSnapshotting(false), 700);
    return () => clearTimeout(t);
  }, []);

  const region = useMemo(() => {
    const points: LatLon[] = [...track, position, ...(originCoords ? [originCoords] : []), ...(destinationCoords ? [destinationCoords] : [])];
    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const latSpan = Math.max(maxLat - minLat, 0.5) * 1.4;
    const lonSpan = Math.max(maxLon - minLon, 0.5) * 1.4;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: latSpan,
      longitudeDelta: lonSpan,
    };
  }, [track, position, originCoords, destinationCoords]);

  return (
    <MapView
      style={{ width: "100%", height: 220 }}
      initialRegion={region}
      userInterfaceStyle="dark"
      showsCompass={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {/* The real flown path — actual reported positions, not an estimate. */}
      <Polyline coordinates={track} strokeColor={c.accent} strokeWidth={3} />

      {/* Remaining leg — a straight-line estimate to the destination, dashed to read as "not the real path" at a glance. */}
      {destinationCoords && (
        <Polyline coordinates={[position, destinationCoords]} strokeColor={c.text3} strokeWidth={2} lineDashPattern={[6, 6]} />
      )}

      {originCoords && (
        <Marker coordinate={originCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.text3, borderWidth: 2, borderColor: c.bg }} />
        </Marker>
      )}
      {destinationCoords && (
        <Marker coordinate={destinationCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.text3, borderWidth: 2, borderColor: c.bg }} />
        </Marker>
      )}

      {/* The aircraft itself: an airliner silhouette drawn pointing north, so
          `rotation` (a true compass heading, clockwise from north) turns it
          to the real direction of travel with no counter-rotation. `flat`
          keeps it glued to the map rather than the screen. */}
      <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }} rotation={heading ?? 0} flat tracksViewChanges={snapshotting}>
        <AirplaneGlyph size={34} color={c.text} outline={c.bg} />
      </Marker>
    </MapView>
  );
}
