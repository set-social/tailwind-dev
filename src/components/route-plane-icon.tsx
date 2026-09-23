import Svg, { Path } from "react-native-svg";

/**
 * A deliberately minimal, solid "paper airplane" dart — not lucide's
 * `Plane` glyph. That one has enough fine wing/tail detail that at the
 * 12-18px this renders at in list rows and route headers, the detail
 * doesn't survive real screen rendering — what's left reads as a random
 * fragment, not a plane (confirmed on-device, twice). Five straight-line
 * points, one fill, nothing fine enough to lose: a wide nose-to-tail
 * dart, pointing right toward the destination by default.
 *
 * Also used (with rotation) as the live tracker map's aircraft marker —
 * its neutral pose points due east/90°, same convention as the lucide
 * icon it replaced, so no rotation-math changes were needed there.
 */
export function RoutePlaneIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 12 L8 3 L13.5 10.3 L13.5 13.7 L8 21 Z" fill={color} />
    </Svg>
  );
}
