import { Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { Trip } from "@/lib/types";
import { c, font } from "@/theme";
import { Press, StatusPill, T } from "@/components/ui";
import { useGo } from "@/navigation/useGo";
import { RoutePlaneIcon } from "@/components/route-plane-icon";

export function TripRow({ trip }: { trip: Trip }) {
  const go = useGo();
  const first = trip.legs[0], last = trip.legs[trip.legs.length - 1];
  const stops = trip.legs.slice(0, -1).map((l) => l.destination.code);
  const href = trip.flightId ? `/flight/${trip.flightId}` : `/trips/${trip.id}`;
  const codes = [first.origin.code, ...stops, last.destination.code];
  return (
    <Press label={`${codes.join(" to ")}, ${trip.dateLabel}, ${trip.outlook.label}`} hitSlop={0} onPress={() => go(href)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {codes.map((code, i) => (
            <View key={code + i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontFamily: font.mono, fontWeight: "700" as const, fontSize: 16, color: c.text }}>{code}</Text>
              {i < codes.length - 1 && <RoutePlaneIcon size={14} color={c.accentBright} />}
            </View>
          ))}
        </View>
        <T v="caption">{trip.dateLabel} · {trip.legs.map((l) => l.code).join(", ")}</T>
        <StatusPill level={trip.outlook.level}>{trip.outlook.label}</StatusPill>
      </View>
      <ChevronRight size={18} color={c.text3} />
    </Press>
  );
}
