import { useCallback, useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { fetchAlerts } from "@/lib/providers";
import { c } from "@/theme";
import HomeScreen from "@/screens/HomeScreen";
import LiveScreen from "@/screens/LiveScreen";
import TripsScreen from "@/screens/TripsScreen";
import AlertsScreen from "@/screens/AlertsScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { HorizonTabBar } from "./HorizonTabBar";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  // Was a hardcoded `tabBarBadge: 2` — real unread count now. A badge is
  // low-stakes enough that a failed fetch just means no badge (undefined),
  // rather than the "fail loud" rule the actual data-fetching screens use.
  const [unread, setUnread] = useState<number | undefined>(undefined);
  const refreshUnread = useCallback(() => {
    fetchAlerts()
      .then((a) => setUnread(a.filter((x) => x.unread).length || undefined))
      .catch(() => {});
  }, []);
  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  return (
    <Tab.Navigator
      screenListeners={{ state: refreshUnread }}
      tabBar={(props) => <HorizonTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} options={{ tabBarBadge: unread }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
