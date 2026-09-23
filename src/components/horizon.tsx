import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { c, font } from "@/theme";

/**
 * The Horizon hero: a planet's limb with the flight route arcing above it.
 * Drawn entirely in SVG (react-native-svg) so it scales with the screen and
 * costs nothing at runtime.
 *
 * The rim glow is a stack of progressively thinner, more opaque strokes
 * rather than an SVG blur filter — it reads the same and can't fall back to
 * a hard band on a device where filter support is missing.
 *
 * Geometry is authored on a 390pt-wide canvas and scaled by the SVG
 * viewBox ("xMidYMin slice"), so it fills any phone width.
 */

type Pt = [number, number];

interface Geometry {
  viewBox: string;
  height: number;
  cy: number;
  fillStart: number;
  fillEnd: number;
  p0: Pt; p1: Pt; p2: Pt; p3: Pt;
  labelY: number;
  durationY: number;
  stars: [number, number, number, number][];
  contours: number[];
}

const R = 430;
const CX = 195;

const GEOMETRY: Record<"home" | "detail", Geometry> = {
  home: {
    viewBox: "0 0 390 520", height: 520, cy: 640, fillStart: 210, fillEnd: 440,
    p0: [60, 231.7], p1: [100, 60], p2: [290, 60], p3: [330, 231.7],
    labelY: 262, durationY: 146,
    stars: [[40, 60, 1, 0.5], [120, 24, 0.8, 0.35], [180, 14, 0.9, 0.4], [262, 30, 1, 0.45], [338, 58, 1.1, 0.5], [366, 122, 0.8, 0.3], [20, 150, 0.9, 0.3], [86, 96, 0.7, 0.3]],
    contours: [402, 372, 336],
  },
  detail: {
    viewBox: "0 40 390 210", height: 210, cy: 600, fillStart: 170, fillEnd: 250,
    p0: [70, 188.6], p1: [105, 40], p2: [285, 40], p3: [320, 188.6],
    labelY: 216, durationY: 0,
    stars: [[30, 82, 1, 0.5], [40, 140, 0.8, 0.3], [150, 52, 0.9, 0.4], [250, 48, 1, 0.45], [350, 72, 1.1, 0.5], [370, 132, 0.8, 0.3]],
    contours: [402],
  },
};

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** De Casteljau split of a cubic at t: the two halves, the point, and the heading there. */
function splitCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number) {
  const p01 = lerp(p0, p1, t), p12 = lerp(p1, p2, t), p23 = lerp(p2, p3, t);
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
  const p0123 = lerp(p012, p123, t);
  return {
    left: [p0, p01, p012, p0123] as const,
    right: [p0123, p123, p23, p3] as const,
    point: p0123,
    // Degrees clockwise from "up" — the plane glyph below is drawn pointing up.
    angle: (Math.atan2(p123[0] - p012[0], -(p123[1] - p012[1])) * 180) / Math.PI,
  };
}

const d = (a: Pt, b: Pt, c2: Pt, e: Pt) => `M${a[0]} ${a[1]} C ${b[0]} ${b[1]}, ${c2[0]} ${c2[1]}, ${e[0]} ${e[1]}`;

const PLANE = "M0 -8.5 L2.9 -2 L9.6 0.7 L9.6 2.6 L2.9 1.4 L1.9 6.7 L4.8 8.9 L4.8 10.3 L0 9.1 L-4.8 10.3 L-4.8 8.9 L-1.9 6.7 L-2.9 1.4 L-9.6 2.6 L-9.6 0.7 L-2.9 -2 Z";

const RIM_GLOW: [number, number][] = [[26, 0.035], [18, 0.06], [11, 0.1], [6, 0.16], [3, 0.28]];
const ARC_GLOW: [number, number][] = [[10, 0.07], [6, 0.13], [3, 0.24]];

export function HorizonHero({
  variant, origin, destination, originCity, destinationCity, progress = null, duration, planeLabel, showRoute = true,
}: {
  variant: "home" | "detail";
  origin?: string;
  destination?: string;
  originCity?: string;
  destinationCity?: string;
  /** 0–100 along the route while airborne; null draws the whole route as not yet flown. */
  progress?: number | null;
  /** e.g. "6h 07m", printed under the plane on the home hero. */
  duration?: string;
  /** Short label next to the plane while it's in flight, e.g. the flight number. */
  planeLabel?: string;
  showRoute?: boolean;
}) {
  const g = GEOMETRY[variant];
  const airborne = progress !== null && progress > 0 && progress < 100;
  const t = airborne ? progress! / 100 : 0.5;
  const s = splitCubic(g.p0, g.p1, g.p2, g.p3, t);
  const fullPath = d(g.p0, g.p1, g.p2, g.p3);
  const remaining = airborne ? d(...s.right) : fullPath;
  const flown = airborne ? d(...s.left) : null;
  // Parked (not yet flown) sits at the apex pointing along the route; in flight it follows the arc.
  const planeAngle = airborne ? s.angle : 90;
  const planeColor = airborne ? c.cyan : c.text;

  return (
    <Svg
      width="100%" height={g.height} viewBox={g.viewBox} preserveAspectRatio="xMidYMin slice" fill="none"
      accessible accessibilityRole="image"
      accessibilityLabel={origin && destination ? `Route from ${origin} to ${destination}${airborne ? `, ${Math.round(progress!)} percent of the way` : ""}` : "Horizon"}
    >
      <Defs>
        <LinearGradient id="hzFill" gradientUnits="userSpaceOnUse" x1="0" y1={g.fillStart} x2="0" y2={g.fillEnd}>
          <Stop offset="0" stopColor="#1c1542" />
          <Stop offset="0.55" stopColor="#0e0e22" />
          <Stop offset="1" stopColor={c.bg} />
        </LinearGradient>
        <LinearGradient id="hzRim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="390" y2="0">
          <Stop offset="0" stopColor={c.accent} stopOpacity="0" />
          <Stop offset="0.2" stopColor={c.accent} stopOpacity="0.6" />
          <Stop offset="0.5" stopColor={c.accentBright} stopOpacity="1" />
          <Stop offset="0.8" stopColor={c.cyan} stopOpacity="0.65" />
          <Stop offset="1" stopColor={c.cyan} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="hzArc" gradientUnits="userSpaceOnUse" x1={g.p0[0]} y1="0" x2={g.p3[0]} y2="0">
          <Stop offset="0" stopColor={c.accent} />
          <Stop offset="1" stopColor={c.cyan} />
        </LinearGradient>
      </Defs>

      {g.stars.map(([x, y, r, o], i) => <Circle key={i} cx={x} cy={y} r={r} fill={c.text} fillOpacity={o} />)}

      <Circle cx={CX} cy={g.cy} r={R} fill="url(#hzFill)" />
      {g.contours.map((r, i) => <Circle key={r} cx={CX} cy={g.cy} r={r} stroke="rgba(255,255,255,0.04)" strokeWidth={1} opacity={1 - i * 0.1} />)}
      {RIM_GLOW.map(([w, o]) => <Circle key={w} cx={CX} cy={g.cy} r={R} stroke="url(#hzRim)" strokeWidth={w} strokeOpacity={o} />)}
      <Circle cx={CX} cy={g.cy} r={R} stroke="url(#hzRim)" strokeWidth={1.5} />

      {showRoute && (
        <>
          {ARC_GLOW.map(([w, o]) => <Path key={w} d={fullPath} stroke="url(#hzArc)" strokeWidth={w} strokeOpacity={o} />)}
          <Path d={fullPath} stroke="url(#hzArc)" strokeWidth={1} strokeOpacity={0.4} />
          <Path d={remaining} stroke={airborne ? c.accentBright : "url(#hzArc)"} strokeOpacity={airborne ? 0.75 : 1} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="0.1 6" />
          {flown && (
            <>
              <Path d={flown} stroke={c.cyan} strokeWidth={5} strokeOpacity={0.35} strokeLinecap="round" />
              <Path d={flown} stroke={c.cyan} strokeWidth={2} strokeLinecap="round" />
              <Circle cx={s.point[0]} cy={s.point[1]} r={13} fill={c.cyan} fillOpacity={0.16} />
            </>
          )}
          <G transform={`translate(${s.point[0]} ${s.point[1]}) rotate(${planeAngle}) scale(1.12)`}>
            <Path d={PLANE} fill={planeColor} />
          </G>
          {airborne && planeLabel ? (
            <SvgText x={s.point[0] + 18} y={s.point[1] + 17} fontFamily={font.sansSemi} fontSize={11} letterSpacing={0.5} fill={c.cyan}>{planeLabel}</SvgText>
          ) : null}
          {!airborne && duration && g.durationY > 0 ? (
            <SvgText x={CX} y={g.durationY} textAnchor="middle" fontFamily={font.sansMedium} fontSize={11} letterSpacing={0.5} fill={c.text2}>{duration}</SvgText>
          ) : null}

          <Circle cx={g.p0[0]} cy={g.p0[1]} r={12} stroke={c.accent} strokeOpacity={0.35} />
          <Circle cx={g.p0[0]} cy={g.p0[1]} r={4.5} fill={c.accentBright} />
          <Circle cx={g.p3[0]} cy={g.p3[1]} r={12} stroke={c.cyan} strokeOpacity={0.35} />
          <Circle cx={g.p3[0]} cy={g.p3[1]} r={4.5} fill={c.cyan} />

          {origin ? <SvgText x={g.p0[0]} y={g.labelY} textAnchor="middle" fontFamily={font.sansSemi} fontSize={12} letterSpacing={1.5} fill={c.text}>{origin}</SvgText> : null}
          {originCity ? <SvgText x={g.p0[0]} y={g.labelY + 16} textAnchor="middle" fontFamily={font.sans} fontSize={11.5} fill={c.text3}>{originCity}</SvgText> : null}
          {destination ? <SvgText x={g.p3[0]} y={g.labelY} textAnchor="middle" fontFamily={font.sansSemi} fontSize={12} letterSpacing={1.5} fill={c.text}>{destination}</SvgText> : null}
          {destinationCity ? <SvgText x={g.p3[0]} y={g.labelY + 16} textAnchor="middle" fontFamily={font.sans} fontSize={11.5} fill={c.text3}>{destinationCity}</SvgText> : null}
        </>
      )}
    </Svg>
  );
}

/**
 * The empty state for every list screen: the bare planet limb and a starfield
 * (no route, nothing tracked yet), then a thin Sora headline and one action.
 * Replaces the old icon-in-a-rounded-square placeholders.
 */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ marginTop: 4 }}>
      <View pointerEvents="none" style={{ marginHorizontal: -24, height: 210 }}>
        <HorizonHero variant="detail" showRoute={false} />
      </View>
      <Text style={{ fontFamily: font.displayLight, fontSize: 34, lineHeight: 40, letterSpacing: -1.2, color: c.text }} accessibilityRole="header">{title}</Text>
      <Text style={{ marginTop: 10, fontFamily: font.sans, fontSize: 15, lineHeight: 22, color: c.text2, maxWidth: 300 }}>{body}</Text>
      {action ? <View style={{ marginTop: 24 }}>{action}</View> : null}
    </View>
  );
}
