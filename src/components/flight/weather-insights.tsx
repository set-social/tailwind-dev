import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import type { AirportWeatherAssessment, Level, WeatherInsights, WxFactor } from "@/lib/types";
import { relativeDay } from "@/lib/dayLabel";
import { buildChart, ceilingLabel, LEVEL_TEXT, levelForGust, ROLE_TEXT, shortDay, skyLabel, visLabel, windLabel } from "@/lib/weatherFormat";
import { c, font, levelColor } from "@/theme";
import { Divider, GlassCard, Skeleton, StatusPill, T } from "@/components/ui";

const eyebrow = { fontFamily: font.sansSemi, fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.text3 } as const;
const dot = (level: Level) => levelColor[level].solid;

/**
 * Weather & recommendations for one flight. The numbers (wind, gusts, times,
 * the outlook) are deterministic findings from real forecasts, METAR/TAF and
 * NWS alerts; the headline, insights and recommendations are AI-written
 * explanation of those findings. When there is no AI text (calm weather, out
 * of questions, service down) the findings and a plain summary line are shown
 * on their own, so this card is never empty when there's data.
 */
export function WeatherInsightsBlocks({ insights, loading }: { insights: WeatherInsights | null; loading: boolean }) {
  if (loading && !insights) {
    return (
      <View style={{ gap: 14 }} accessibilityLabel="Loading weather">
        <Skeleton w="85%" h={22} />
        <Skeleton w="100%" h={14} />
        <Skeleton w="92%" h={14} />
        <Skeleton w="100%" h={180} />
      </View>
    );
  }
  if (!insights) return null;

  const n = insights.narrative;
  const headline = n?.headline ?? insights.summaryLine;
  const note =
    insights.narrativeStatus === "ai" ? "Explained by FlightIQ from the real forecasts and reports below. It describes conditions; it doesn't predict delays."
    : insights.narrativeStatus === "limit" ? "You've used today's written explanations. The live findings below are still up to date."
    : insights.narrativeStatus === "unavailable" && insights.level !== "good" ? "The written summary isn't available right now. The live findings below are."
    : null;

  const sources = [...new Set([insights.departure, insights.arrival, insights.inbound].flatMap((a) => a?.sources ?? []))];

  return (
    <View style={{ gap: 22 }}>
      <View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 10, backgroundColor: dot(insights.level) }} />
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: font.displayRegular, fontSize: 20, lineHeight: 27, letterSpacing: -0.4, color: c.text }}>{headline}</Text>
        </View>
        {note && <T v="caption" style={{ marginTop: 8 }}>{note}</T>}
      </View>

      {n && n.insights.length > 0 && (
        <View style={{ gap: 12 }}>
          {n.insights.map((line, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 9, backgroundColor: c.accentBright }} />
              <Text style={{ flex: 1, fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: c.text2 }}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      {n && n.recommendations.length > 0 && (
        <GlassCard style={{ padding: 18 }}>
          <Text style={{ ...eyebrow, marginBottom: 14 }}>What to do</Text>
          {n.recommendations.map((r, i) => (
            <View key={i}>
              {i > 0 && <Divider style={{ marginVertical: 14 }} />}
              <View style={{ flexDirection: "row", gap: 14 }}>
                <Text style={{ width: 16, fontFamily: font.displayLight, fontSize: 20, lineHeight: 24, color: c.accentBright }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.sansSemi, fontSize: 14.5, lineHeight: 21, color: c.text }}>{r.action}</Text>
                  <Text style={{ marginTop: 4, fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: c.text2 }}>{r.why}</Text>
                </View>
              </View>
            </View>
          ))}
        </GlassCard>
      )}

      <AirportCard a={insights.departure} />
      <AirportCard a={insights.arrival} />
      {insights.inbound && <AirportCard a={insights.inbound} compact />}

      {sources.length > 0 && <T v="caption">Sources: {sources.join(" · ")}.</T>}
    </View>
  );
}

// ─── one airport ─────────────────────────────────────────────────────────

function AirportCard({ a, compact = false }: { a: AirportWeatherAssessment; compact?: boolean }) {
  const cond = a.conditions;
  const day = relativeDay(a.focusIso, a.timezone);
  const wind = windLabel(cond), ceil = ceilingLabel(cond), sky = skyLabel(cond);
  const shown: WxFactor[] = compact ? a.factors.filter((f) => f.id === "wind" || f.id === "pattern") : a.factors;

  return (
    <GlassCard style={{ padding: 18 }} live={a.role === "arrival"}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={eyebrow}>{ROLE_TEXT[a.role]}</Text>
          <Text style={{ marginTop: 4, fontFamily: font.displayLight, fontSize: 30, lineHeight: 36, letterSpacing: -1, color: c.text }}>{a.airport}</Text>
          <T v="caption" style={{ marginTop: 2 }}>{day ? `${day.label} · ` : ""}{a.focusLabel}</T>
        </View>
        {a.dataAvailable && <StatusPill level={a.level}>{LEVEL_TEXT[a.level]}</StatusPill>}
      </View>

      {!a.dataAvailable ? (
        <T style={{ marginTop: 14, fontSize: 13 }}>No weather outlook for this time yet. Forecasts reach about a week ahead, and FlightIQ will fill this in as the flight gets closer.</T>
      ) : (
        <>
          {!compact && (
            <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", rowGap: 14 }}>
              <Cell label="Wind" main={wind.main} sub={wind.sub} unit={cond?.windKt != null ? "kt" : undefined} tone={cond ? levelForGust(Math.max(cond.gustKt ?? 0, cond.windKt ?? 0)) : "good"} />
              <Cell label="Visibility" main={visLabel(cond?.visibilityMi ?? null)} sub="miles" tone={cond?.flightCategory === "IFR" || cond?.flightCategory === "LIFR" ? "watch" : "good"} />
              <Cell label="Ceiling" main={ceil.main} sub={ceil.sub} />
              <Cell label="Sky" main={sky.main} sub={sky.sub} small />
            </View>
          )}

          {!compact && a.observedNow && (
            <T v="caption" style={{ marginTop: 14 }}>
              Right now ({a.observedNow.atLocal}): {a.observedNow.windDirName ?? "variable"} {a.observedNow.windKt ?? "—"} kt
              {a.observedNow.gustKt ? `, gusting ${a.observedNow.gustKt}` : ""}
              {a.observedNow.flightCategory ? ` · ${a.observedNow.flightCategory}` : ""}
            </T>
          )}

          {!compact && a.chart.length > 2 && (
            <View style={{ marginTop: 18 }}>
              <Text style={{ ...eyebrow, marginBottom: 8 }}>Wind around your flight</Text>
              <WindChart a={a} />
              <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
                <Legend color={c.accentBright} text="Gusts" />
                <Legend color={c.text3} text="Sustained wind" />
                <Legend color={c.cyan} text="Your flight" />
              </View>
            </View>
          )}

          {!compact && a.daily.length > 1 && (
            <View style={{ marginTop: 18 }}>
              <Text style={{ ...eyebrow, marginBottom: 10 }}>Peak gusts by day (kt)</Text>
              <View style={{ flexDirection: "row" }}>
                {a.daily.map((d) => (
                  <View key={d.label} style={{ flex: 1, alignItems: "center" }} accessibilityLabel={`${d.label}: peak gust ${d.peakGustKt} knots${d.dominantDir ? ` from the ${d.dominantDir}` : ""}`}>
                    <Text style={{ fontFamily: font.sans, fontSize: 11, color: c.text3 }}>{shortDay(d.label)}</Text>
                    <Text style={{ marginTop: 3, fontFamily: font.displayLight, fontSize: 19, lineHeight: 24, color: levelForGust(d.peakGustKt) === "good" ? c.text : levelColor[levelForGust(d.peakGustKt)].text }}>{d.peakGustKt}</Text>
                    <Text style={{ fontFamily: font.sans, fontSize: 10.5, color: c.text3 }}>{d.dominantDir ?? "—"}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {shown.length > 0 && (
            <View style={{ marginTop: 18, gap: 12 }}>
              {!compact && <Text style={eyebrow}>Findings</Text>}
              {shown.map((f, i) => (
                <View key={`${f.id}-${i}`} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, marginTop: 6, backgroundColor: dot(f.level) }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.sansSemi, fontSize: 13.5, lineHeight: 19, color: c.text }}>{f.title}</Text>
                    <Text style={{ marginTop: 1, fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: c.text2 }}>{f.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </GlassCard>
  );
}

function Cell({ label, main, sub, unit, tone = "good", small }: { label: string; main: string; sub?: string | null; unit?: string; tone?: Level; small?: boolean }) {
  return (
    <View style={{ width: "50%", paddingRight: 8 }}>
      <Text style={eyebrow}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: 4, fontFamily: font.displayLight, fontSize: small ? 18 : 24, lineHeight: small ? 26 : 30, letterSpacing: -0.6, color: tone === "good" || tone === "neutral" ? c.text : levelColor[tone].text }}>
        {main}{unit ? <Text style={{ fontSize: 12, letterSpacing: 0, color: c.text2 }}> {unit}</Text> : null}
      </Text>
      {sub ? <Text style={{ fontFamily: font.sans, fontSize: 11.5, color: c.text3 }}>{sub}</Text> : null}
    </View>
  );
}

const Legend = ({ color, text }: { color: string; text: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
    <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: color }} />
    <Text style={{ fontFamily: font.sans, fontSize: 11, color: c.text3 }}>{text}</Text>
  </View>
);

// ─── wind chart ──────────────────────────────────────────────────────────

const CHART_H = 118;

function WindChart({ a }: { a: AirportWeatherAssessment }) {
  const [w, setW] = useState(0);
  const g = w > 0 ? buildChart(a.chart, a.focusIso, a.timezone, w, CHART_H) : null;
  const anchor = g && g.focusX !== null ? (g.focusX < 70 ? "start" : g.focusX > w - 70 ? "end" : "middle") : "middle";
  return (
    <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} accessible accessibilityRole="image" accessibilityLabel={`Wind and gust chart for ${a.airport} around your flight`}>
      {g && (
        <Svg width={w} height={CHART_H}>
          <Defs>
            <SvgGradient id="wxArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.accent} stopOpacity="0.3" />
              <Stop offset="1" stopColor={c.accent} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Line x1={0} x2={w} y1={g.baselineY} y2={g.baselineY} stroke={c.hairline} strokeWidth={1} />
          <Line x1={0} x2={w} y1={g.thresholdY} y2={g.thresholdY} stroke={c.watch} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" />
          <SvgText x={w} y={g.thresholdY - 4} textAnchor="end" fontFamily={font.sans} fontSize={9.5} fill={c.watch}>25 kt</SvgText>
          <Path d={g.areaPath} fill="url(#wxArea)" />
          <Path d={g.windPath} stroke={c.text3} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
          {g.gustSegments.map((s, i) => (
            <Line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} strokeWidth={2} strokeLinecap="round" stroke={s.level === "good" ? c.accentBright : levelColor[s.level].solid} />
          ))}
          {g.focusX !== null && (
            <>
              <Line x1={g.focusX} x2={g.focusX} y1={14} y2={g.baselineY} stroke={c.cyan} strokeWidth={1.5} strokeOpacity={0.9} />
              <Circle cx={g.focusX} cy={14} r={3} fill={c.cyan} />
              <SvgText x={g.focusX} y={8} textAnchor={anchor} fontFamily={font.sansSemi} fontSize={10} fill={c.cyan}>{a.focusLabel}</SvgText>
            </>
          )}
          {g.ticks.map((t, i) => (
            <SvgText key={i} x={Math.min(t.x + 3, w - 22)} y={CHART_H - 6} fontFamily={font.sans} fontSize={10} fill={c.text3}>{t.label}</SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
