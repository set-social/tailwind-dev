import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { TabParamList } from "./types";

const tabs: Record<string, keyof TabParamList> = { "": "Home", live: "Live", trips: "Trips", alerts: "Alerts", profile: "Profile" };

/** Navigate from the href-style paths used in the mock data ("/flight/ua1482", "/alerts"). */
export function useGo() {
  const nav = useNavigation();
  return useCallback((href: string) => {
    const [head, id] = href.replace(/^\//, "").split("/");
    if (head === "flight" && id) nav.navigate("Flight", { id });
    else if (head === "trips" && id) nav.navigate("Trip", { id });
    else if (head === "search") nav.navigate("Search");
    else if (head in tabs) nav.navigate("Tabs", { screen: tabs[head] });
  }, [nav]);
}
