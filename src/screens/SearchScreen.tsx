import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Check, ChevronRight, Plus, Search as SearchIcon, X } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { flightProvider, trackTrip, untrackTrip } from "@/lib/providers";
import type { SearchResult } from "@/lib/types";
import type { RootStackParamList } from "@/navigation/types";
import { c, font, radius } from "@/theme";
import { Chip, Divider, FadeRule, FieldBox, PageHeader, Press, Screen, Skeleton, StatusPill, T } from "@/components/ui";
import { RoutePlaneIcon } from "@/components/route-plane-icon";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Next 14 days, "Today" first — covers the near-term window a flight-number
// lookup actually needs (a new route, a red-eye that lands the next day,
// checking a specific future date) without a full calendar picker, which
// would mean a new native dependency (@react-native-community/datetimepicker)
// and another rebuild for something this near-term-focused.
const DATE_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return {
    date: toDateStr(d),
    label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric" }),
  };
});

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [q, setQ] = useState("");
  const [date, setDate] = useState(DATE_OPTIONS[0].date);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set(["s1"]));

  const onChange = (v: string) => { setQ(v); setLoading(v.trim().length > 0); };
  useEffect(() => {
    let cancelled = false;
    // The 350ms delay debounces typing; the search itself may then take
    // longer still for an exact flight number (a real, cached-server-side
    // AeroAPI lookup — see lookupLive in flightProvider.ts) than for a
    // route/city query (mock, instant).
    const id = setTimeout(async () => {
      if (!q.trim()) { setResults([]); setLoading(false); return; }
      const r = await flightProvider.searchFlights(q, date);
      if (!cancelled) { setResults(r); setLoading(false); }
    }, q.trim() ? 350 : 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q, date]);
  const selectedLabel = DATE_OPTIONS.find((o) => o.date === date)?.label ?? date;
  // Mock rows just toggle locally (as before). Live rows persist for real
  // via trackTrip/untrackTrip (needs a session — sign-up/guest now gates
  // the whole app, see RootNavigator), optimistically, rolling back the
  // UI if the write fails.
  const toggle = async (r: SearchResult) => {
    const wasAdded = added.has(r.id);
    setAdded((s) => { const n = new Set(s); if (wasAdded) n.delete(r.id); else n.add(r.id); return n; });
    if (!r.flightNumber || !r.date) return;
    try {
      if (wasAdded) await untrackTrip(r.id);
      else await trackTrip(r.id, r.code);
    } catch (err) {
      console.error("track trip failed:", err);
      setAdded((s) => { const n = new Set(s); if (wasAdded) n.add(r.id); else n.delete(r.id); return n; });
    }
  };

  return (
    <Screen bottomInset>
      <PageHeader eyebrow="Add a flight" title="Find your flight." />
      <FieldBox>
        <SearchIcon size={18} color={c.text3} strokeWidth={1.5} />
        <TextInput value={q} onChangeText={onChange} placeholder="Flight number, route or airport" placeholderTextColor={c.text3} autoCapitalize="none" autoCorrect={false} returnKeyType="search" autoFocus accessibilityLabel="Search flights" style={{ flex: 1, height: 52, fontFamily: font.sans, fontSize: 16, color: c.text }} />
        {q.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange("")} hitSlop={12}><X size={16} color={c.text3} /></Pressable>}
      </FieldBox>

      <T v="caption" style={{ marginTop: 16, marginBottom: 8 }}>Departure date — matters for a flight number: a new route, or one that flies different city pairs on different days, only resolves correctly on the right date.</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {DATE_OPTIONS.map((opt) => <Chip key={opt.date} label={opt.label} on={opt.date === date} onPress={() => setDate(opt.date)} />)}
      </ScrollView>

      {!q.trim() && (
        <View style={{ marginTop: 20 }}>
          <T v="eyebrow" style={{ marginBottom: 12 }}>Try</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {flightProvider.popularSearches().map((s) => <Chip key={s} label={s} onPress={() => onChange(s)} />)}
          </View>
          <T style={{ marginTop: 32 }}>Search by <Text style={{ fontFamily: font.sansMedium, color: c.text }}>flight number</Text> (UA 1482), <Text style={{ fontFamily: font.sansMedium, color: c.text }}>route</Text> (EWR to LAX) or <Text style={{ fontFamily: font.sansMedium, color: c.text }}>airport</Text> (Atlanta). Add a flight and FlightIQ starts watching it right away.</T>
        </View>
      )}

      {loading && <View style={{ marginTop: 28, gap: 26 }} accessibilityLabel="Searching">{[0, 1, 2].map((i) => <View key={i} style={{ gap: 10 }}><Skeleton w={150} h={20} /><Skeleton w="70%" h={14} /></View>)}</View>}

      {!loading && q.trim() !== "" && results.length === 0 && (
        <View style={{ marginTop: 64, alignItems: "center" }}>
          <T v="display" style={{ textAlign: "center" }}>Nothing on that route.</T>
          <T style={{ marginTop: 12, textAlign: "center" }}>No flights match "{q}" on {selectedLabel.toLowerCase()}. Check the flight number, try a different date, or an airport code like EWR.</T>
        </View>
      )}

      {!loading && results.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <T v="caption" style={{ marginBottom: 6 }}>{results.length} {results.length === 1 ? "flight" : "flights"} · {selectedLabel}</T>
          <FadeRule />
          {results.map((r, i) => {
            const on = added.has(r.id);
            const live = Boolean(r.flightNumber && r.date);
            const details = [r.terminal && `Terminal ${r.terminal}`, r.gate && `Gate ${r.gate}`, r.aircraftType].filter(Boolean).join(" · ");
            const body = (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontFamily: font.displayLight, fontSize: 24, letterSpacing: -0.6, color: c.text }}>{r.origin.code}</Text>
                  <RoutePlaneIcon size={15} color={c.accentBright} />
                  <Text style={{ fontFamily: font.displayLight, fontSize: 24, letterSpacing: -0.6, color: c.text }}>{r.destination.code}</Text>
                  {live && <ChevronRight size={15} color={c.text3} />}
                </View>
                <T v="caption" style={{ marginTop: 3 }}>{r.airline} {r.code.split(" ")[1]} · {r.depart} → {r.arrive} · {r.daysLabel}</T>
                {details !== "" && <T v="caption" style={{ marginTop: 1 }}>{details}</T>}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <StatusPill level={r.outlook.level}>{r.outlook.label}</StatusPill>
                  {r.onTimePct !== undefined && <T v="caption">{r.onTimePct}% on time</T>}
                </View>
              </View>
            );
            return (
              <View key={r.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 }}>
                  {live ? (
                    <Press label={`View live details for ${r.code}`} onPress={() => navigation.navigate("LiveFlight", { flightNumber: r.flightNumber!, date: r.date! })} style={{ flex: 1 }}>
                      {body}
                    </Press>
                  ) : body}
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${on ? "Remove" : "Add"} ${r.code}`} onPress={() => toggle(r)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: on ? c.okSoft : c.text }}>
                    {on ? <Check size={15} color={c.ok} /> : <Plus size={15} color={c.bg} strokeWidth={2.2} />}
                    <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: on ? c.ok : c.bg }}>{on ? "Added" : "Add"}</Text>
                  </Pressable>
                </View>
                {/* Tracker map lives on the flight detail view (tap through
                    via the row above), not this compact list — see LiveFlightView. */}
              </View>
            );
          })}
          <Divider />
        </View>
      )}
    </Screen>
  );
}
