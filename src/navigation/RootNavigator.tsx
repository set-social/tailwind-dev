import { useEffect, useRef, useState } from "react";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { c } from "@/theme";
import { supabase } from "@/lib/supabase";
import FlightScreen from "@/screens/FlightScreen";
import LiveFlightScreen from "@/screens/LiveFlightScreen";
import LoadingScreen from "@/screens/LoadingScreen";
import TripScreen from "@/screens/TripScreen";
import SearchScreen from "@/screens/SearchScreen";
import SignUpScreen from "@/screens/SignUpScreen";
import WelcomeScreen from "@/screens/WelcomeScreen";
import { TabNavigator } from "./TabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, text: c.text, border: c.hairline, primary: c.accent } };
const screenOptions = { headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "slide_from_right" as const };

/**
 * Auth-gated, following React Navigation's standard pattern: one
 * Stack.Navigator whose *screen set* changes based on session state
 * (unauthenticated -> SignUp; authenticated -> the real app) —
 * switching resets that navigator's state, which is exactly what "log in,
 * land somewhere fresh" wants. hadInitialSession distinguishes a cold
 * launch with an existing session (skip straight to Tabs) from a session
 * that just appeared this run (just signed up/continued as guest — show
 * Welcome first); it's set once, from the very first session check.
 */
export function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const hadInitialSession = useRef(false);

  useEffect(() => {
    if (!supabase) { setChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      hadInitialSession.current = Boolean(data.session);
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) return <LoadingScreen />;

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={screenOptions}
        initialRouteName={!session ? "SignUp" : hadInitialSession.current ? "Tabs" : "Welcome"}
      >
        {!session ? (
          <Stack.Screen name="SignUp" component={SignUpScreen} />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Screen name="Flight" component={FlightScreen} />
            <Stack.Screen name="LiveFlight" component={LiveFlightScreen} />
            <Stack.Screen name="Trip" component={TripScreen} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ presentation: "modal" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
