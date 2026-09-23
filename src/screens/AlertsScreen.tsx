import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowRight, CircleCheck, CloudLightning, DoorOpen, Link2, Navigation, TrendingUp } from "lucide-react-native";
import { fetchAlerts, markAlertRead } from "@/lib/providers";
import type { Alert } from "@/lib/types";
import { c, font, levelColor } from "@/theme";
import { Divider, FadeRule, PageHeader, Press, Screen, Skeleton, T } from "@/components/ui";
import { EmptyState } from "@/components/horizon";
import { useGo } from "@/navigation/useGo";

const icons = { delay: TrendingUp, leave: Navigation, gate: DoorOpen, connection: Link2, weather: CloudLightning, good: CircleCheck };

/** Real data only. Empty for any account until something's actually happened on a tracked flight — nothing here is scripted. */
export default function AlertsScreen() {
  const go = useGo();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchAlerts()
        .then((a) => { if (!cancelled) { setAlerts(a); setError(false); } })
        .catch((err) => { console.error("fetchAlerts failed:", err); if (!cancelled) setError(true); });
      return () => { cancelled = true; };
    }, []),
  );

  const onOpen = (a: Alert) => {
    if (a.unread) {
      setAlerts((s) => s?.map((x) => (x.id === a.id ? { ...x, unread: false } : x)) ?? s);
      markAlertRead(a.id).catch((err) => console.error("markAlertRead failed:", err));
    }
    if (a.action) go(a.action.href);
  };

  return (
    <Screen bottomInset>
      <PageHeader eyebrow="Intelligence feed" title="Only what matters." subtitle="FlightIQ alerts you when a change affects what you should do, not every time an airline updates a screen." />

      {alerts === null && !error && (
        <View style={{ gap: 22, marginTop: 8 }} accessibilityLabel="Loading alerts">
          <Skeleton w="100%" h={20} />
          <Skeleton w="70%" h={14} />
        </View>
      )}

      {error && <T style={{ marginTop: 24 }}>Couldn't load your alerts right now.</T>}

      {alerts !== null && alerts.length === 0 && !error && (
        <EmptyState
          title="Nothing yet"
          body="Once you're tracking a flight, FlightIQ alerts you here when something actually changes what you should do."
        />
      )}

      {alerts !== null && alerts.length > 0 && (
        <>
          <FadeRule />
          {alerts.map((a, i) => {
            const Icon = icons[a.kind];
            const col = levelColor[a.level];
            return (
              <View key={a.id}>
                {i > 0 && <Divider />}
                <Press label={`${a.title}. ${a.unread ? "Unread." : ""}`} onPress={() => onOpen(a)} style={{ flexDirection: "row", gap: 14, paddingVertical: 18 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: col.soft, alignItems: "center", justifyContent: "center" }}><Icon size={18} color={col.text} strokeWidth={1.7} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <T v="caption" style={{ flex: 1 }} numberOfLines={1}>{a.tripLabel}</T>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {a.unread && <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
                        <T v="caption">{a.time}</T>
                      </View>
                    </View>
                    <T v="heading" style={{ marginTop: 6, fontSize: 16, lineHeight: 22 }}>{a.title}</T>
                    <T style={{ marginTop: 6 }}>{a.body}</T>
                    {a.action && (
                      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: c.cyan }}>{a.action.label}</Text>
                        <ArrowRight size={13} color={c.cyan} />
                      </View>
                    )}
                  </View>
                </Press>
              </View>
            );
          })}
          <Divider />
        </>
      )}
    </Screen>
  );
}
