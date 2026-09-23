import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Search as SearchIcon } from "lucide-react-native";
import { fetchTrips, untrackTrip, type TrackedTrip } from "@/lib/providers";
import { outlookFromStatus } from "@/lib/providers/flightProvider";
import type { RootStackParamList } from "@/navigation/types";
import { c, font } from "@/theme";
import { Button, Divider, FadeRule, PageHeader, Press, Screen, Skeleton, StatusPill, T } from "@/components/ui";
import { EmptyState } from "@/components/horizon";
import { RoutePlaneIcon } from "@/components/route-plane-icon";
import { SwipeableRow } from "@/components/swipeable-row";

/**
 * Real data only — no more `src/lib/data/trips.ts`. A fresh account has
 * zero rows here (that's the point: see the sign-up flow's Welcome
 * screen), so the empty state below is the common case, not an edge case.
 */
export default function TripsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [trips, setTrips] = useState<TrackedTrip[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchTrips()
        .then((t) => { if (!cancelled) { setTrips(t); setError(false); } })
        .catch((err) => { console.error("fetchTrips failed:", err); if (!cancelled) setError(true); });
      return () => { cancelled = true; };
    }, []),
  );

  const onRemove = async (trip: TrackedTrip) => {
    // Optimistic: gone from the list immediately. On failure, refetch to
    // resync rather than guess the row back into place.
    setTrips((t) => t?.filter((x) => x.id !== trip.id) ?? t);
    try {
      await untrackTrip(trip.flightKey);
    } catch (err) {
      console.error("untrackTrip failed:", err);
      fetchTrips().then(setTrips).catch(() => {});
    }
  };

  return (
    <Screen bottomInset>
      <PageHeader eyebrow="Your trips" title="Trips" />

      {trips === null && !error && (
        <View style={{ gap: 22, marginTop: 8 }} accessibilityLabel="Loading trips">
          <Skeleton w="100%" h={20} />
          <Skeleton w="70%" h={14} />
        </View>
      )}

      {error && (
        <View style={{ marginTop: 48, alignItems: "center" }}>
          <T style={{ textAlign: "center" }}>Couldn't load your trips right now.</T>
        </View>
      )}

      {trips !== null && trips.length === 0 && !error && (
        <EmptyState
          title="No flights yet"
          body="Search a flight number to add your first flight, and FlightIQ starts watching it."
          action={<Button label="Search flights" variant="light" onPress={() => navigation.navigate("Search")} icon={<SearchIcon size={16} color={c.bg} strokeWidth={2} />} style={{ alignSelf: "flex-start", minWidth: 190 }} />}
        />
      )}

      {trips !== null && trips.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <T v="eyebrow" style={{ marginBottom: 4 }}>Tracked · {trips.length}</T>
          <FadeRule style={{ marginTop: 10 }} />
          {trips.map((trip, i) => (
            <View key={trip.id}>
              {i > 0 && <Divider />}
              <SwipeableRow label={trip.code} onDelete={() => onRemove(trip)}>
                <Press
                  label={`${trip.code}, ${trip.origin} to ${trip.destination}`}
                  onPress={() => navigation.navigate("LiveFlight", { flightNumber: trip.flightNumber, date: trip.date })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, backgroundColor: c.bg }}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontFamily: font.displayLight, fontSize: 24, letterSpacing: -0.6, color: c.text }}>{trip.origin}</Text>
                      <RoutePlaneIcon size={14} color={c.accentBright} />
                      <Text style={{ fontFamily: font.displayLight, fontSize: 24, letterSpacing: -0.6, color: c.text }}>{trip.destination}</Text>
                    </View>
                    <T v="caption">{trip.code} · {trip.departLocal}</T>
                    <StatusPill level={outlookFromStatus(trip.status, trip.delayMinutes).level}>{outlookFromStatus(trip.status, trip.delayMinutes).label}</StatusPill>
                  </View>
                  <ChevronRight size={18} color={c.text3} />
                </Press>
              </SwipeableRow>
            </View>
          ))}
          <Divider />
        </View>
      )}
    </Screen>
  );
}
