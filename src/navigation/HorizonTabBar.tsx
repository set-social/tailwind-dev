import { useContext } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import LinearGradient from "react-native-linear-gradient";
import { Bell, Briefcase, Home, Radar, User } from "lucide-react-native";
import { c, font } from "@/theme";

const ICONS: Record<string, typeof Home> = { Home, Live: Radar, Trips: Briefcase, Alerts: Bell, Profile: User };

/**
 * The Horizon tab bar: a floating capsule with a gradient hairline edge. The
 * focused tab grows into a violet pill with its label; the rest are bare
 * icons. It reports its own height so scroll views can clear it (see
 * `Screen` in components/ui.tsx).
 */
export function HorizonTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const bottomOffset = Math.max(insets.bottom - 14, 12);

  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingBottom: bottomOffset }}
    >
      <LinearGradient colors={c.edge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 31, padding: 1 }}>
        <View style={{ height: 60, borderRadius: 30, backgroundColor: "rgba(16,16,34,0.94)", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 6 }}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = typeof options.title === "string" ? options.title : route.name;
            const Icon = ICONS[route.name] ?? Home;
            const badge = options.tabBarBadge;
            const color = focused ? c.accentBright : c.text3;

            const onPress = () => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={badge !== undefined ? `${label}, ${badge} unread` : label}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                style={{
                  width: focused ? 62 : 56, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", gap: 2,
                  backgroundColor: focused ? c.accentPill : "transparent",
                  borderWidth: 1, borderColor: focused ? c.accentPillBorder : "transparent",
                }}
              >
                <Icon size={focused ? 20 : 21} color={color} strokeWidth={focused ? 1.6 : 1.4} />
                {focused && <Text style={{ fontFamily: font.sansSemi, fontSize: 9.5, color }}>{label}</Text>}
                {badge !== undefined && (
                  <View style={{ position: "absolute", top: 9, right: focused ? 16 : 15, width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.accent, borderWidth: 1.5, borderColor: "#14142a" }} />
                )}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}
