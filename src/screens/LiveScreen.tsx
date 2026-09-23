import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search as SearchIcon } from "lucide-react-native";
import { fetchTrips, type TrackedTrip } from "@/lib/providers";
import type { RootStackParamList } from "@/navigation/types";
import { c } from "@/theme";
import { Button, Screen, Skeleton, T } from "@/components/ui";
import { EmptyState } from "@/components/horizon";
import { LiveFlightView } from "@/components/flight/live-flight-view";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Real data only — was `flightProvider.getNextFlight()`, which always
 * returned the same mock UA1482 regardless of anything you'd actually
 * tracked. Now: whichever of your real tracked_trips departs today (if
 * any) renders through the exact same LiveFlightView LiveFlightScreen
 * uses — same real inbound aircraft, weather, risk factors, everything.
 * No "showAddButton": you're only seeing this because it's already
 * tracked, so offering to add it again would be redundant.
 */
export default function LiveScreen() {
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

  if (trips === null && !error) {
    return (
      <Screen bottomInset>
        <View style={{ gap: 18, marginTop: 40 }} accessibilityLabel="Loading">
          <Skeleton w="100%" h={150} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen bottomInset>
        <View style={{ marginTop: 64, alignItems: "center" }}>
          <T style={{ textAlign: "center" }}>Couldn't load your trips right now.</T>
        </View>
      </Screen>
    );
  }

  const today = todayStr();
  const todayTrip = trips!.find((t) => t.date === today);

  if (!todayTrip) {
    return (
      <Screen bottomInset>
        <EmptyState
          title="Nothing to track today"
          body={`Live tracking — inbound aircraft, weather, real signals — shows here for a tracked flight departing today. ${trips!.length > 0 ? "None of your tracked flights are today." : "You don't have any flights tracked yet."}`}
          action={
            <Button
              label={trips!.length > 0 ? "See your trips" : "Search flights"}
              variant="light"
              onPress={() => (trips!.length > 0 ? navigation.navigate("Tabs", { screen: "Trips" }) : navigation.navigate("Search"))}
              icon={<SearchIcon size={16} color={c.bg} strokeWidth={2} />}
              style={{ alignSelf: "flex-start", minWidth: 190 }}
            />
          }
        />
      </Screen>
    );
  }

  return <LiveFlightView flightNumber={todayTrip.flightNumber} date={todayTrip.date} showAddButton={false} />;
}
