import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { LiveFlightView } from "@/components/flight/live-flight-view";
import type { RootStackParamList } from "@/navigation/types";

/** Route-param-driven wrapper — reached from Search/Trips with a specific {flightNumber, date}. The actual content is LiveFlightView, shared with the Live tab (LiveScreen). */
export default function LiveFlightScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, "LiveFlight">>();
  const navigation = useNavigation();
  return <LiveFlightView flightNumber={params.flightNumber} date={params.date} onBack={() => navigation.goBack()} />;
}
