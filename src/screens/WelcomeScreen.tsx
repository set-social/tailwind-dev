import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search as SearchIcon } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import type { RootStackParamList } from "@/navigation/types";
import { c, font } from "@/theme";
import { Button, GlassCard, Screen, T } from "@/components/ui";
import { EmptyState } from "@/components/horizon";

/**
 * Shown once, right after sign-up succeeds (see RootNavigator's
 * initialRouteName logic — a returning session skips straight to Tabs).
 * "0 flights tracked" is accurate by construction: this only renders for a
 * brand-new session, which cannot have any tracked_trips rows yet.
 */
export default function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const initial = (email ?? "?").trim().charAt(0).toUpperCase();

  const onFindFlight = () => {
    // Reset (not push) so backing out of Search lands on Tabs, not here.
    navigation.reset({ index: 1, routes: [{ name: "Tabs" }, { name: "Search" }] });
  };

  return (
    <Screen topPad={24}>
      <EmptyState
        title="You're all set."
        body="Your account is ready — nothing's added yet. Search a flight number to start tracking your first real flight."
        action={
          <View style={{ gap: 20 }}>
            {email && (
              <GlassCard style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: font.displayLight, fontSize: 18, color: c.accentBright }}>{initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.sansSemi, fontSize: 14, color: c.text }}>{email}</Text>
                  <T v="caption" style={{ marginTop: 2 }}>0 flights tracked</T>
                </View>
              </GlassCard>
            )}
            <Button label="Find your first flight" variant="light" onPress={onFindFlight} icon={<SearchIcon size={16} color={c.bg} strokeWidth={2} />} />
          </View>
        }
      />
    </Screen>
  );
}
