import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Share2, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flightProvider } from "@/lib/providers";
import { fmtTime } from "@/lib/utils";
import { computeLeavePlan } from "@/lib/leave";
import { profile } from "@/lib/data";
import { c, font, glow, radius } from "@/theme";
import { Divider, GlassCard, Press, Reveal, Screen, StageTag, T, Toggle } from "@/components/ui";
import { RouteMap } from "@/components/route-map";
import { AskSheet } from "@/components/ask-sheet";
import type { RootStackParamList } from "@/navigation/types";

export default function FlightScreen() {
  const { params: { id } } = useRoute<RouteProp<RootStackParamList, "Flight">>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const detail = flightProvider.getFlightDetail(id);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [rules, setRules] = useState({ gate: true, delay: true, swap: true });
  const ask = (question: string | null) => { setQ(question); setOpen(true); };
  const close = useCallback(() => setOpen(false), []);

  if (!detail) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: c.bg }}>
        <T v="display" style={{ textAlign: "center" }}>We couldn't find that flight.</T>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={{ marginTop: 20 }}><Text style={{ fontFamily: font.sansMedium, color: c.accentBright }}>Go back</Text></Pressable>
      </View>
    );
  }

  const f = detail.flight;
  const a = detail.aircraft;
  const plan = computeLeavePlan(detail.leave, f.boardingStart, 0, profile.arrivalBuffer);
  const topSignals = [...detail.intelligence.signals].sort((x, y) => y.weight - x.weight).slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen bottomInset>
        <Press label="Back" onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -4, marginBottom: 16 }}>
          <ChevronLeft size={18} color={c.text2} /><Text style={{ fontFamily: font.sansMedium, fontSize: 13, color: c.text2 }}>Back</Text>
        </Press>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <T v="caption">{f.code} · {f.airline}</T>
          <View style={{ backgroundColor: c.okSoft, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.ok }} />
            <Text style={{ fontFamily: font.sansSemi, fontSize: 11, color: c.ok }}>{f.airlineStatus.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 16, alignItems: "flex-start" }}>
          <Text style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: -0.6 }}>{f.origin.code}</Text>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 16 }}><View style={{ width: "80%", height: 1, backgroundColor: c.surfaceBorder }} /></View>
          <Text style={{ fontFamily: font.display, fontSize: 36, color: c.text, letterSpacing: -0.6 }}>{f.destination.code}</Text>
        </View>
        <T v="caption" style={{ textAlign: "center", marginTop: 4 }}>{fmtTime(f.depart)} – {fmtTime(f.arrive)} · Terminal {f.terminal}, Gate {f.gate}</T>

        <View style={{ gap: 16, marginTop: 26 }}>

          <Reveal>
            <GlassCard style={{ padding: 18 }}>
              <StageTag stage="sense" />
              <Press label="See live tracking" onPress={() => navigation.navigate("Tabs", { screen: "Live" })} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="label">Tracking {a.tail}</T>
                <ChevronLeft size={15} color={c.text3} style={{ transform: [{ rotate: "180deg" }] }} />
              </Press>
              <T v="caption" style={{ marginTop: 4 }}>{a.altitudeFt.toLocaleString()} ft · {a.groundSpeedKts} kts · {a.departedLate} min behind schedule</T>
            </GlassCard>
          </Reveal>

          <Reveal index={1}>
            <GlassCard style={{ padding: 18 }}>
              <StageTag stage="sense" />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="label">Aircraft swap watch</T>
                <Text style={{ fontFamily: font.monoBold, fontSize: 14, color: c.watch }}>{a.swap.probability}%</Text>
              </View>
              <T v="caption" style={{ marginTop: 4 }}>Spare {a.swap.type} ({a.swap.tail}) {a.swap.location}</T>
            </GlassCard>
          </Reveal>

          <Reveal index={2}>
            <GlassCard style={{ padding: 18 }}>
              <StageTag stage="predict" />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <T v="label">Delay forecast</T>
                <Text style={{ fontFamily: font.monoBold, fontSize: 26, color: c.watch }}>{f.forecast.probability}%</Text>
              </View>
              <T v="caption" style={{ marginTop: 2 }}>{f.forecast.label} · likely {fmtTime(f.forecast.likelyDeparture.from)}–{fmtTime(f.forecast.likelyDeparture.to)}</T>

              <View style={{ marginTop: 16, gap: 10 }}>
                {topSignals.map((s) => (
                  <View key={s.id}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <T v="label" style={{ fontSize: 12.5 }} numberOfLines={1}>{s.label} — {s.value}</T>
                      <T v="mono" style={{ fontSize: 12 }} color={c.text3}>{s.weight}%</T>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: c.surface, marginTop: 5, overflow: "hidden" }}>
                      <View style={{ width: `${s.weight}%`, height: "100%", backgroundColor: s.level === "risk" ? c.risk : c.watch }} />
                    </View>
                  </View>
                ))}
              </View>
            </GlassCard>
          </Reveal>

          <Reveal index={3}>
            <GlassCard style={{ padding: 18 }}>
              <StageTag stage="decide" />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="label">Leave-by plan</T>
                <Text style={{ fontFamily: font.monoBold, fontSize: 19, color: c.text }}>{fmtTime(plan.leaveBy)}</Text>
              </View>
              <View style={{ marginTop: 12, gap: 8 }}>
                {detail.leave.components.map((comp) => (
                  <View key={comp.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <T v="caption" style={{ flex: 1 }}>{comp.label}</T>
                    <T v="mono" style={{ fontSize: 12 }}>{comp.minutes}m</T>
                  </View>
                ))}
              </View>
            </GlassCard>
          </Reveal>

          <Reveal index={4}>
            <GlassCard style={{ padding: 18 }}>
              <StageTag stage="act" />
              <T v="label" style={{ marginBottom: 12 }}>Alerts for this flight</T>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T style={{ fontSize: 13.5 }}>Gate change</T><Toggle label="Gate change" value={rules.gate} onChange={(v) => setRules((r) => ({ ...r, gate: v }))} /></View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T style={{ fontSize: 13.5 }}>Delay past 15 min</T><Toggle label="Delay past 15 min" value={rules.delay} onChange={(v) => setRules((r) => ({ ...r, delay: v }))} /></View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><T style={{ fontSize: 13.5 }}>Aircraft swap</T><Toggle label="Aircraft swap" value={rules.swap} onChange={(v) => setRules((r) => ({ ...r, swap: v }))} /></View>
              </View>
              <Divider style={{ marginVertical: 14 }} />
              <Press label="Share live ETA" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="label" style={{ fontSize: 13.5 }}>Share live ETA</T>
                <Share2 size={15} color={c.accentBright} />
              </Press>
            </GlassCard>
          </Reveal>
        </View>
      </Screen>

      <Press label="Ask FlightIQ" onPress={() => ask(null)}
        style={{ position: "absolute", right: 20, bottom: insets.bottom + 16, flexDirection: "row", alignItems: "center", gap: 8, height: 50, paddingHorizontal: 20, borderRadius: 25, backgroundColor: c.accent, ...glow.accent }}>
        <Sparkles size={15} color={c.bg} />
        <Text style={{ fontFamily: font.sansSemi, fontSize: 14.5, color: c.bg }}>Ask FlightIQ</Text>
      </Press>
      <AskSheet open={open} onClose={close} flightKey={f.id} title={`${f.code} · ${f.origin.code} → ${f.destination.code}`} initial={q} suggested={detail.intelligence.suggested} />
    </View>
  );
}
