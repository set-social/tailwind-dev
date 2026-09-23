import { View } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { c, font } from "@/theme";

const P0 = { x: 30, y: 100 }, P1 = { x: 170, y: 16 }, P2 = { x: 310, y: 84 };

function bezPoint(t: number) {
  const mt = 1 - t;
  return { x: mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x, y: mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y };
}
function bezAngle(t: number) {
  const mt = 1 - t;
  const dx = 2 * mt * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  const dy = 2 * mt * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Great-circle-style route arc with a live aircraft marker — the visual language for "Sense". */
export function RouteMap({ origin, destination, progress, height = 150, tint = c.cyan }: { origin: string; destination: string; progress: number; height?: number; tint?: string }) {
  const p = bezPoint(progress);
  const angle = bezAngle(progress);
  return (
    <View>
      <Svg width="100%" height={height} viewBox="0 0 340 130">
        <Path d={`M${P0.x},${P0.y} Q${P1.x},${P1.y} ${P2.x},${P2.y}`} fill="none" stroke={c.accentBright} strokeOpacity={0.22} strokeWidth={1.4} strokeDasharray="1 5" />
        <Path
          d={`M${P0.x},${P0.y} Q${P1.x},${P1.y} ${P2.x},${P2.y}`}
          fill="none" stroke={tint} strokeWidth={2.2} strokeLinecap="round"
          // @ts-expect-error — pathLength normalizes strokeDashoffset to 0–1, supported by react-native-svg
          pathLength={1}
          strokeDasharray={`${progress} 1`}
        />
        <Circle cx={P0.x} cy={P0.y} r={4} fill={tint} />
        <SvgText x={P0.x} y={P0.y + 20} fill={c.text3} fontFamily={font.sansSemi} fontSize={11} textAnchor="middle">{origin}</SvgText>
        <Circle cx={P2.x} cy={P2.y} r={4} fill="none" stroke={c.accentBright} strokeWidth={1.4} />
        <SvgText x={P2.x} y={P2.y - 14} fill={c.text3} fontFamily={font.sansSemi} fontSize={11} textAnchor="middle">{destination}</SvgText>
        <Circle cx={p.x} cy={p.y} r={12} fill={tint} opacity={0.2} />
        <PlaneMark x={p.x} y={p.y} angle={angle} color={tint} />
      </Svg>
    </View>
  );
}

function PlaneMark({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  return (
    <Path
      d="M0,-5.5 L5,5 L0,2.2 L-5,5 Z"
      fill={color}
      transform={`translate(${x} ${y}) rotate(${angle})`}
    />
  );
}
