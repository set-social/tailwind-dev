import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { LogOut } from "lucide-react-native";
import { fetchProfile, saveProfile } from "@/lib/providers";
import { signOut, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { c, font } from "@/theme";
import { Divider, EdgedSurface, FadeRule, GlassCard, PageHeader, Press, Screen, Segmented, Skeleton, Stepper, T, Toggle } from "@/components/ui";

const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 14 }}>
    <View style={{ flex: 1 }}><T v="label">{title}</T>{hint && <T v="caption" style={{ marginTop: 2 }}>{hint}</T>}</View>
    {children}
  </View>
);
const Group = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <View style={{ marginBottom: 28 }}>
    <T v="eyebrow">{title}</T>
    {note && <T v="caption" style={{ marginTop: 8 }}>{note}</T>}
    <FadeRule style={{ marginTop: 10 }} />
    {children}
    <Divider />
  </View>
);

/**
 * Real data only — fetches from `profiles` (see db.ts), saves each change
 * back immediately. No more the mock "Maya Chen" default, and no more the
 * fabricated "Leave by" card that used to sit here: it read
 * computeLeavePlan() against the mock FlightDetail, which meant a made-up
 * clock time next to genuinely-yours preference settings. Gone until
 * there's a real leave-plan computation to back it with.
 */
export default function ProfileScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetchProfile().then(setP).catch((err) => { console.error("fetchProfile failed:", err); setError(true); });
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((s) => (s ? { ...s, [k]: v } : s));
    saveProfile({ [k]: v }).catch((err) => console.error("saveProfile failed:", err));
  };

  const onSignOut = async () => {
    setSigningOut(true);
    const { error: err } = await signOut();
    if (err) { console.error("sign out failed:", err); setSigningOut(false); }
    // On success RootNavigator swaps back to the sign-up flow on its own.
  };

  const rows = (items: React.ReactNode[]) => items.map((n, i) => <View key={i}>{i > 0 && <Divider />}{n}</View>);

  return (
    <Screen bottomInset>
      <PageHeader eyebrow="Preferences" title="Made for how you travel." />

      {error && <T style={{ marginTop: 24 }}>Couldn't load your profile right now.</T>}

      {!p && !error && (
        <View style={{ gap: 18, marginTop: 8 }} accessibilityLabel="Loading profile">
          <Skeleton w={220} h={20} />
          <Skeleton w="100%" h={54} />
        </View>
      )}

      {p && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 28 }}>
            <EdgedSurface edge={c.edge} fill={["#0e0f1e", "#0e0f1e"]} radius={29} style={{ width: 58, height: 58 }} contentStyle={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: font.displayLight, fontSize: 24, color: c.accentBright }}>{(p.name || email || "?").trim().charAt(0).toUpperCase()}</Text>
            </EdgedSurface>
            <View>
              <T v="heading" style={{ fontSize: 18 }}>{p.name || email || "Guest"}</T>
              {email && p.name && <T v="caption">{email}</T>}
            </View>
          </View>

          <Group title="Airport" note="These shape every recommendation, from when to leave to how much cushion you get.">
            {rows([
              <Row title="Home airport" hint="Used as the default when adding a flight"><View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}><Text style={{ fontFamily: font.displayRegular, fontSize: 14, letterSpacing: 0.5, color: c.text }}>{p.homeAirport || "—"}</Text></View></Row>,
              <Row title="Preferred arrival buffer" hint="Spare time before boarding"><Stepper label="buffer" value={p.arrivalBuffer} min={0} max={60} step={5} format={(v) => `${v} min`} onChange={(v) => set("arrivalBuffer", v)} /></Row>,
              <Row title="TSA PreCheck" hint="Shorter security estimates"><Toggle label="TSA PreCheck" value={p.preCheck} onChange={(v) => set("preCheck", v)} /></Row>,
              <Row title="CLEAR" hint="Faster ID check"><Toggle label="CLEAR" value={p.clear} onChange={(v) => set("clear", v)} /></Row>,
              <Row title="Checked bags" hint="Adds bag-drop time"><Stepper label="bags" value={p.checkedBags} min={0} max={5} onChange={(v) => set("checkedBags", v)} /></Row>,
            ])}
          </Group>

          <Group title="Getting to the airport">
            <View style={{ paddingVertical: 14, gap: 12 }}>
              <T v="label">Usual transportation</T>
              <Segmented value={p.transport} onChange={(v) => set("transport", v)} options={[{ id: "drive", label: "Drive & park" }, { id: "rideshare", label: "Rideshare" }, { id: "transit", label: "Transit" }]} />
              <T v="caption">{p.transport === "drive" ? "Includes traffic and parking time." : p.transport === "rideshare" ? "Includes pickup wait and drop-off." : "Uses live transit schedules."}</T>
            </View>
          </Group>

          <Group title="Units">
            {rows([
              <Row title="Temperature" hint="Used for weather throughout the app">
                <Segmented value={p.tempUnit} onChange={(v) => set("tempUnit", v)} options={[{ id: "F", label: "°F" }, { id: "C", label: "°C" }]} />
              </Row>,
            ])}
          </Group>

          <Group title="Notifications" note="Alerts are only sent when they change what you should do.">
            {rows(p.notifications.map((n) => (
              <Row key={n.id} title={n.label} hint={n.description}>
                <Toggle label={n.label} value={n.enabled} onChange={(v) => setP((s) => (s ? { ...s, notifications: s.notifications.map((x) => (x.id === n.id ? { ...x, enabled: v } : x)) } : s))} />
              </Row>
            )))}
          </Group>

          <GlassCard style={{ padding: 4 }}>
            <Press
              label="Sign out"
              onPress={onSignOut}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, opacity: signingOut ? 0.6 : 1 }}
            >
              <LogOut size={16} color={c.risk} />
              <Text style={{ fontFamily: font.sansMedium, fontSize: 14.5, color: c.risk }}>{signingOut ? "Signing out…" : "Sign out"}</Text>
            </Press>
          </GlassCard>
        </>
      )}
    </Screen>
  );
}
