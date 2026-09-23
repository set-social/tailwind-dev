import { Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Footprints, TrainFront, TriangleAlert } from "lucide-react-native";
import { flightProvider } from "@/lib/providers";
import type { Connection, TripLeg } from "@/lib/types";
import { fmtDuration, fmtTime } from "@/lib/utils";
import { c, font, levelColor } from "@/theme";
import { GlassCard, Press, Screen, StatusPill, T } from "@/components/ui";
import type { RootStackParamList } from "@/navigation/types";
import { RoutePlaneIcon } from "@/components/route-plane-icon";

function Leg({ l }: { l: TripLeg }) {
  const dur = ((l.arrive - l.depart + 1440) % 1440) + (l.destination.tz !== l.origin.tz ? 180 : 0);
  return (
    <GlassCard style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: font.sansMedium, fontSize: 13, color: c.text }}>{l.code} <Text style={{ color: c.text3 }}>· {l.airline}</Text></Text>
        <StatusPill level={l.status.level}>{l.status.label}</StatusPill>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
        <View>
          <T v="display" style={{ fontSize: 30 }}>{l.origin.code}</T>
          <Text style={{ fontFamily: font.monoBold, fontSize: 15, color: c.text, marginTop: 8 }}>{fmtTime(l.depart)}</Text>
          <T v="caption" style={{ marginTop: 2 }}>{l.origin.city}{l.terminal ? ` · T${l.terminal}` : ""}{l.gate ? ` · ${l.gate}` : ""}</T>
        </View>
        <View style={{ flex: 1, alignItems: "center", marginHorizontal: 10 }}>
          <RoutePlaneIcon size={17} color={c.accentBright} />
          <View style={{ height: 1, alignSelf: "stretch", backgroundColor: c.surfaceBorder, marginVertical: 5 }} />
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: c.text3 }}>{fmtDuration(dur)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T v="display" style={{ fontSize: 30 }}>{l.destination.code}</T>
          <Text style={{ fontFamily: font.monoBold, fontSize: 15, color: c.text, marginTop: 8 }}>{fmtTime(l.arrive)}</Text>
          <T v="caption" style={{ marginTop: 2 }}>{l.destination.city}</T>
        </View>
      </View>
      <T v="caption" style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: c.hairline }}>{l.aircraft}</T>
    </GlassCard>
  );
}

function ConnectionRisk({ cn }: { cn: Connection }) {
  const st = levelColor[cn.level], max = 60;
  const pct = (v: number) => `${(v / max) * 100}%` as `${number}%`;
  return (
    <GlassCard style={{ padding: 20, borderColor: cn.level === "risk" ? "rgba(255,84,112,0.3)" : c.glassBorder }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <TriangleAlert size={16} color={st.text} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontFamily: font.sansSemi, fontSize: 15, lineHeight: 21, color: st.text }}>Connection in {cn.airport} · {cn.risk}% chance of missing it</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 20 }}>
        <View style={{ flex: 1 }}><T v="eyebrow">On paper</T><Text style={{ fontFamily: font.monoBold, fontSize: 22, color: c.text, marginTop: 8 }}>{cn.scheduledMin}<Text style={{ fontSize: 12, color: c.text3 }}> min</Text></Text></View>
        <View style={{ flex: 1 }}><T v="eyebrow">You'll likely have</T><Text style={{ fontFamily: font.monoBold, fontSize: 22, color: st.text, marginTop: 8 }}>{cn.expectedMin}<Text style={{ fontSize: 12, color: c.text3 }}> min</Text></Text></View>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surface, marginTop: 18, justifyContent: "center" }} accessibilityLabel={`${cn.expectedMin} of ${cn.scheduledMin} scheduled minutes, ${cn.walkMin} minute walk`}>
        <View style={{ position: "absolute", height: 10, borderRadius: 5, width: pct(cn.scheduledMin), backgroundColor: c.surfaceBorder }} />
        <View style={{ position: "absolute", height: 10, borderRadius: 5, width: pct(cn.expectedMin), backgroundColor: st.solid }} />
        <View style={{ position: "absolute", top: -5, bottom: -5, width: 1.5, left: pct(cn.walkMin), backgroundColor: c.text }} />
      </View>
      <T v="caption" style={{ marginTop: 8 }}>The line marks the {cn.walkMin} minutes you'll need to get there.</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderColor: c.hairline }}>
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontFamily: font.monoBold, fontSize: 13, color: c.text }}>{cn.gateFrom}</Text></View>
        <TrainFront size={15} color={c.text3} /><Footprints size={15} color={c.text3} />
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontFamily: font.monoBold, fontSize: 13, color: c.text }}>{cn.gateTo}</Text></View>
        <T v="caption" style={{ marginLeft: "auto" }}>{cn.walkMin} min by train + walking</T>
      </View>
      <T style={{ marginTop: 14, color: c.text }}>{cn.advice}</T>
    </GlassCard>
  );
}

export default function TripScreen() {
  const { params: { id } } = useRoute<RouteProp<RootStackParamList, "Trip">>();
  const navigation = useNavigation();
  const trip = flightProvider.getTrip(id);
  if (!trip) return <Screen bottomInset><T v="display">Trip not found.</T></Screen>;
  const first = trip.legs[0], last = trip.legs[trip.legs.length - 1];
  const codes = [first.origin.code, ...trip.legs.slice(0, -1).map((l) => l.destination.code), last.destination.code];
  return (
    <Screen bottomInset>
      <Press label="Back to trips" onPress={() => navigation.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -4 }}>
        <ChevronLeft size={16} color={c.text2} /><Text style={{ fontFamily: font.sansMedium, fontSize: 13, color: c.text2 }}>Trips</Text>
      </Press>
      <View style={{ paddingTop: 20, paddingBottom: 28 }}>
        <T v="eyebrow" style={{ marginBottom: 12 }}>{trip.dateLabel}</T>
        <T v="display" accessibilityRole="header">{codes.join(" → ")}</T>
        <View style={{ marginTop: 16 }}><StatusPill level={trip.outlook.level}>{trip.outlook.label}</StatusPill></View>
      </View>
      <View style={{ gap: 16 }}>
        {trip.legs.map((l, i) => (
          <View key={l.code} style={{ gap: 16 }}>
            <Leg l={l} />
            {trip.connections[i] && <ConnectionRisk cn={trip.connections[i]} />}
          </View>
        ))}
      </View>
    </Screen>
  );
}
