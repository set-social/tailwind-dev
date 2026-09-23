import { Text, View } from "react-native";
import { ArrowRight, Navigation, Sparkles } from "lucide-react-native";
import type { FlightDetail } from "@/lib/types";
import { computeLeavePlan } from "@/lib/leave";
import { fmtDuration, fmtTime } from "@/lib/utils";
import { c, font, radius } from "@/theme";
import { GlassCard, Press, T } from "@/components/ui";
import { useGo } from "@/navigation/useGo";

export function NextFlightCard({ detail, now, arrivalBuffer }: { detail: FlightDetail; now: number; arrivalBuffer: number }) {
  const go = useGo();
  const f = detail.flight;
  const plan = computeLeavePlan(detail.leave, f.boardingStart, 0, arrivalBuffer);
  return (
    <Press label={`Next flight ${f.code}, ${f.origin.code} to ${f.destination.code}. Open details.`} hitSlop={0} onPress={() => go(`/flight/${f.id}`)}>
      <GlassCard style={{ padding: 22 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: c.text }}>{f.code} <Text style={{ color: c.text3, fontFamily: font.sans }}>· {f.airline}</Text></Text>
          <T v="eyebrow" color={c.accentBright}>Next flight</T>
        </View>

        <View style={{ flexDirection: "row", marginTop: 20 }}>
          <View>
            <Text style={{ fontFamily: font.display, fontSize: 38, lineHeight: 40, color: c.text, letterSpacing: -0.8 }}>{f.origin.code}</Text>
            <Text style={{ fontFamily: font.mono, fontWeight: "700" as const, fontSize: 16, color: c.text, marginTop: 10 }}>{fmtTime(f.depart, { suffix: false })}<Text style={{ fontSize: 11, color: c.text3 }}> {f.depart % 1440 < 720 ? "AM" : "PM"}</Text></Text>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: "100%", height: 1, backgroundColor: c.accentSoft }} />
            <ArrowRight size={13} color={c.accentBright} style={{ position: "absolute" }} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: font.display, fontSize: 38, lineHeight: 40, color: c.text, letterSpacing: -0.8 }}>{f.destination.code}</Text>
            <Text style={{ fontFamily: font.mono, fontWeight: "700" as const, fontSize: 16, color: c.text, marginTop: 10, textAlign: "right" }}>{fmtTime(f.arrive, { suffix: false })}<Text style={{ fontSize: 11, color: c.text3 }}> {f.arrive % 1440 < 720 ? "AM" : "PM"}</Text></Text>
          </View>
        </View>
        <Text style={{ textAlign: "center", marginTop: 8, fontFamily: font.sans, fontSize: 12, color: c.text3 }}>{fmtDuration(f.durationMin)} · Terminal {f.terminal}, Gate {f.gate}</Text>

        <View style={{ flexDirection: "row", marginTop: 18, gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: c.okSoft, borderRadius: radius.md, padding: 12 }}>
            <T v="eyebrow" style={{ fontSize: 9.5 }}>United</T>
            <Text style={{ fontFamily: font.sansSemi, fontSize: 14.5, color: c.ok, marginTop: 5 }}>{f.airlineStatus.label}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.watchSoft, borderRadius: radius.md, padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Sparkles size={10} color={c.watch} /><T v="eyebrow" style={{ fontSize: 9.5 }}>FlightIQ</T></View>
            <Text style={{ fontFamily: font.sansSemi, fontSize: 14.5, color: c.watch, marginTop: 5 }}>{f.forecast.probability}% risk</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, backgroundColor: c.accentSoft, borderRadius: radius.md, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <Navigation size={17} color={c.accentBright} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: c.text }}>Leave by {fmtTime(plan.leaveBy)}</Text>
              <Text style={{ fontFamily: font.sans, fontSize: 11.5, color: c.text3, marginTop: 2 }}>in {fmtDuration(Math.max(0, plan.leaveBy - now))}</Text>
            </View>
          </View>
          <ArrowRight size={14} color={c.accentBright} />
        </View>
      </GlassCard>
    </Press>
  );
}
