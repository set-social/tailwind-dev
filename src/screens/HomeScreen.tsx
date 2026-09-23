import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, ChevronRight, Search as SearchIcon } from "lucide-react-native";
import { fetchAlerts, fetchTrips, type TrackedTrip } from "@/lib/providers";
import { outlookFromStatus } from "@/lib/providers/flightProvider";
import type { Alert, WeatherInsights } from "@/lib/types";
import { fetchWeatherInsights } from "@/lib/providers/weatherInsights";
import type { RootStackParamList } from "@/navigation/types";
import { c, font, levelColor } from "@/theme";
import { Button, Divider, EdgedSurface, FadeRule, Press, Reveal, Screen, SectionHeader, Skeleton, StatusPill, T } from "@/components/ui";
import { HorizonHero } from "@/components/horizon";
import { Wordmark } from "@/components/brand";
import { useGo } from "@/navigation/useGo";
import { RoutePlaneIcon } from "@/components/route-plane-icon";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "6:45 PM" -> { main: "6:45", suffix: "PM", zone: "CDT" } — in the given (airport) timezone, whichever hour cycle the device uses. */
function splitTime(iso: string | null, tz: string | null): { main: string; suffix: string; zone: string } {
  if (!iso) return { main: "--:--", suffix: "", zone: "" };
  const opt = tz ? { timeZone: tz } : {};
  let s: string, zone = "";
  try {
    s = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...opt });
    zone = new Date(iso).toLocaleTimeString([], { timeZoneName: "short", ...opt }).split(/\s/).pop() ?? "";
  } catch {
    s = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const m = s.match(/^(.*?)\s*([AaPp]\.?[Mm]\.?)$/);
  const z = /^[A-Z]{2,5}$/.test(zone) || /^GMT/.test(zone) ? zone : "";
  return m ? { main: m[1], suffix: m[2].replace(/\./g, "").toUpperCase(), zone: z } : { main: s, suffix: "", zone: z };
}

function fmtHm(totalMin: number): string {
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function countdown(iso: string | null, now: number): string {
  if (!iso) return "—";
  const min = Math.round((new Date(iso).getTime() - now) / 60000);
  if (min <= 0) return "Now";
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
  return fmtHm(min);
}

function dayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, t)) return "Today";
  const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1);
  if (same(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** One plain sentence from the flight's real status — never a forecast. */
function statement(t: TrackedTrip): string {
  if (t.status === "cancelled") return "This flight has been cancelled.";
  if (t.status === "diverted") return "This flight has been diverted.";
  if (t.status === "landed") return "This flight has landed.";
  if (t.status === "departed") return "In the air and on its way.";
  if (t.delayMinutes > 0) return `Running ${t.delayMinutes >= 60 ? fmtHm(t.delayMinutes) : `${t.delayMinutes} min`} behind schedule.`;
  return "On schedule right now.";
}

const eyebrowStyle = { fontFamily: font.sansSemi, fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.text3 } as const;

/**
 * Real data only. Once showed a fully fabricated "Maya Chen" flight and
 * hour-by-hour schedule from src/lib/data — that's gone. A fresh account
 * (the point of the sign-up flow) just looks fresh: either your nearest
 * real tracked flight or a prompt to add one. There is deliberately no
 * delay percentage here — there's no validated model behind one.
 *
 * Horizon layout: everything above the readout row lives in one fixed-height
 * block (HERO_H) so the planet-limb art and the readout line up on every
 * phone regardless of how the type wraps.
 */
const HERO_H = 504; // header top -> top of the readout row
const ART_TOP = 214; // header top -> top of the planet art

export default function HomeScreen() {
  const go = useGo();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [trips, setTrips] = useState<TrackedTrip[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [now, setNow] = useState(Date.now());
  const [wx, setWx] = useState<WeatherInsights | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setNow(Date.now());
      fetchTrips()
        .then((t) => { if (!cancelled) setTrips(t); })
        .catch((err) => { console.error("fetchTrips failed:", err); if (!cancelled) setTrips([]); });
      fetchAlerts()
        .then((a) => { if (!cancelled) setAlerts(a); })
        .catch((err) => console.error("fetchAlerts failed:", err));
      return () => { cancelled = true; };
    }, []),
  );

  const today = todayStr();
  const nextTrip = trips
    ? [...trips].filter((t) => t.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? trips[0] ?? null
    : null;

  // A one-line weather headline for the next flight. Best effort: null just hides it.
  const wxKey = nextTrip && !["landed", "cancelled", "diverted"].includes(nextTrip.status) ? nextTrip.flightKey : null;
  useEffect(() => {
    if (!wxKey) { setWx(null); return; }
    let cancelled = false;
    fetchWeatherInsights(wxKey).then((r) => { if (!cancelled) setWx(r); });
    return () => { cancelled = true; };
  }, [wxKey]);

  const open = (t: TrackedTrip) => navigation.navigate("LiveFlight", { flightNumber: t.flightNumber, date: t.date });

  const header = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 44 }}>
      <Wordmark width={118} />
      <Press label="Search flights" onPress={() => go("/search")} hitSlop={0} style={{ marginRight: -4 }}>
        <EdgedSurface edge={c.edgeLive} fill={["#0e0f1e", "#0e0f1e"]} radius={22} style={{ width: 44, height: 44 }} contentStyle={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <SearchIcon size={18} color={c.text2} strokeWidth={1.5} />
        </EdgedSurface>
      </Press>
    </View>
  );

  // What the readout row shows once a flight has left: arrival time instead of a countdown.
  const inAir = nextTrip?.status === "departed" || nextTrip?.status === "landed";
  const outlook = nextTrip ? outlookFromStatus(nextTrip.status, nextTrip.delayMinutes) : null;
  const dep = splitTime(nextTrip?.departIso ?? null, nextTrip?.originTz ?? null);
  const arr = splitTime(nextTrip?.arriveIso ?? null, nextTrip?.destTz ?? null);
  const durationMin = nextTrip?.departIso && nextTrip?.arriveIso
    ? Math.round((new Date(nextTrip.arriveIso).getTime() - new Date(nextTrip.departIso).getTime()) / 60000)
    : 0;

  return (
    <Screen topPad={insets.top}>
      <View style={{ height: HERO_H }}>
        {/* Planet-limb art sits behind everything; it starts under the sub-line and runs down past the readout. */}
        <View pointerEvents="none" style={{ position: "absolute", left: -24, right: -24, top: ART_TOP, height: 520 }}>
          <HorizonHero
            variant="home"
            showRoute={!!nextTrip}
            origin={nextTrip?.origin}
            destination={nextTrip?.destination}
            duration={durationMin > 0 ? fmtHm(durationMin) : undefined}
          />
        </View>

        {header}

        {trips === null && (
          <View style={{ marginTop: 22, gap: 16 }} accessibilityLabel="Loading">
            <Skeleton w={150} h={14} />
            <Skeleton w={230} h={92} />
            <Skeleton w={190} h={16} />
          </View>
        )}

        {trips !== null && nextTrip && (
          <Reveal>
            <Press
              label={`Next flight ${nextTrip.code}, ${nextTrip.origin} to ${nextTrip.destination}, departs ${dep.main} ${dep.suffix} ${dep.zone}`}
              onPress={() => open(nextTrip)}
              hitSlop={0}
            >
              <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.cyan, shadowColor: c.cyan, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
                <Text style={{ ...eyebrowStyle, fontSize: 11.5, color: c.text2 }}>Next flight · {nextTrip.code}</Text>
              </View>
              <View style={{ marginTop: 4, flexDirection: "row", alignItems: "baseline" }}>
                <Text
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
                  style={{ fontFamily: font.displayThin, fontSize: 108, lineHeight: 112, letterSpacing: -5.4, color: c.text, flexShrink: 1 }}
                >
                  {dep.main}
                </Text>
                {dep.suffix !== "" && <Text style={{ marginLeft: 8, fontFamily: font.displayLight, fontSize: 22, color: c.text2 }}>{dep.suffix}{dep.zone ? <Text style={{ fontFamily: font.sans, fontSize: 12, letterSpacing: 0.5, color: c.text3 }}>{`  ${dep.zone}`}</Text> : null}</Text>}
              </View>
              <Text style={{ marginTop: 2, fontFamily: font.sans, fontSize: 15, color: c.text2 }} numberOfLines={1}>
                {[`${nextTrip.origin} to ${nextTrip.destination}`, dayLabel(nextTrip.departIso) !== "Today" ? dayLabel(nextTrip.departIso) : null, nextTrip.gate ? `Gate ${nextTrip.gate}` : null].filter(Boolean).join(" · ")}
              </Text>
            </Press>
          </Reveal>
        )}

        {trips !== null && !nextTrip && (
          <Reveal>
            <Text style={{ ...eyebrowStyle, marginTop: 18, fontSize: 11.5, color: c.text2 }}>No flights tracked</Text>
            <Text style={{ marginTop: 8, fontFamily: font.displayLight, fontSize: 42, lineHeight: 48, letterSpacing: -1.6, color: c.text }}>Where to next?</Text>
            <Text style={{ marginTop: 10, fontFamily: font.sans, fontSize: 15, lineHeight: 22, color: c.text2, maxWidth: 300 }}>Search a flight number to add your first one.</Text>
            <Button
              label="Search flights" variant="light" onPress={() => go("/search")}
              icon={<SearchIcon size={16} color={c.bg} strokeWidth={2} />}
              style={{ marginTop: 20, alignSelf: "flex-start", minWidth: 190 }}
            />
          </Reveal>
        )}
      </View>

      {trips !== null && nextTrip && outlook && (
        <Reveal index={1}>
          <FadeRule />
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1.15 }}>
              <Text style={eyebrowStyle}>Status</Text>
              <Text
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}
                style={{ marginTop: 6, fontFamily: font.displayLight, fontSize: 26, lineHeight: 34, letterSpacing: -0.8, color: outlook.level === "neutral" ? c.text : levelColor[outlook.level].text }}
              >
                {outlook.label}
              </Text>
            </View>
            <View style={{ flex: 1.1, paddingHorizontal: 8 }}>
              <Text style={eyebrowStyle}>{inAir ? "Arrives" : "Departs in"}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ marginTop: 6, fontFamily: font.displayLight, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: c.text }}>
                {inAir ? `${arr.main}${arr.suffix ? ` ${arr.suffix}` : ""}` : countdown(nextTrip.departIso, now)}
              </Text>
            </View>
            <View style={{ flex: 0.75, alignItems: "flex-end" }}>
              <Text style={eyebrowStyle} numberOfLines={1}>{nextTrip.terminal ? `Terminal ${nextTrip.terminal}` : "Gate"}</Text>
              <Text
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}
                accessibilityLabel={nextTrip.gate ? `Gate ${nextTrip.gate}` : "Gate not posted yet"}
                style={{ marginTop: 6, fontFamily: font.displayLight, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: nextTrip.gate ? c.text : c.text3 }}
              >
                {nextTrip.gate ?? "—"}
              </Text>
            </View>
          </View>

          <Text style={{ marginTop: 16, fontFamily: font.sans, fontSize: 14.5, lineHeight: 21, color: c.text2 }}>{statement(nextTrip)}</Text>
          {wx && (wx.departure.dataAvailable || wx.arrival.dataAvailable) && (
            <Press label={`Weather: ${wx.narrative?.headline ?? wx.summaryLine}`} onPress={() => open(nextTrip)} hitSlop={0} style={{ marginTop: 10, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, marginTop: 7, backgroundColor: levelColor[wx.level].solid }} />
              <Text numberOfLines={3} style={{ flex: 1, fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: c.text2 }}>{wx.narrative?.headline ?? wx.summaryLine}</Text>
            </Press>
          )}
          <Press label="Flight details" onPress={() => open(nextTrip)} hitSlop={0} style={{ marginTop: 2, height: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: c.cyan }}>Flight details</Text>
            <ArrowRight size={16} color={c.cyan} strokeWidth={1.6} />
          </Press>
        </Reveal>
      )}

      {alerts.length > 0 && (
        <View style={{ marginTop: 32 }}>
          <SectionHeader eyebrow="Now" title="What FlightIQ is watching" action={<Press label="All alerts" onPress={() => go("/alerts")}><Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: c.accentBright }}>All alerts</Text></Press>} />
          <FadeRule style={{ marginTop: 14 }} />
          {alerts.slice(0, 2).map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: "row", gap: 12, paddingVertical: 16 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, marginTop: 7, backgroundColor: levelColor[a.level].solid }} />
                <View style={{ flex: 1 }}>
                  <T v="label" style={{ fontFamily: font.sansSemi, lineHeight: 21 }}>{a.title}</T>
                  <T v="caption" style={{ marginTop: 4, lineHeight: 19 }}>{a.body}</T>
                  {a.action && (
                    <Press label={a.action.label} onPress={() => go(a.action!.href)} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: c.cyan }}>{a.action.label}</Text>
                      <ArrowRight size={12} color={c.cyan} />
                    </Press>
                  )}
                </View>
              </View>
            </View>
          ))}
          <Divider />
        </View>
      )}

      {trips !== null && trips.length > 1 && (
        <View style={{ marginTop: 32 }}>
          <SectionHeader eyebrow="Coming up" title="Upcoming trips" action={<Press label="See all trips" onPress={() => go("/trips")}><Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: c.accentBright }}>See all</Text></Press>} />
          <FadeRule style={{ marginTop: 14 }} />
          {trips.filter((t) => t.id !== nextTrip?.id).slice(0, 3).map((t, i) => {
            const o = outlookFromStatus(t.status, t.delayMinutes);
            return (
              <View key={t.id}>
                {i > 0 && <Divider />}
                <Press
                  label={`${t.code}, ${t.origin} to ${t.destination}`}
                  onPress={() => open(t)}
                  hitSlop={0}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, minHeight: 64 }}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontFamily: font.displayLight, fontSize: 22, letterSpacing: -0.5, color: c.text }}>{t.origin}</Text>
                      <RoutePlaneIcon size={13} color={c.accentBright} />
                      <Text style={{ fontFamily: font.displayLight, fontSize: 22, letterSpacing: -0.5, color: c.text }}>{t.destination}</Text>
                    </View>
                    <T v="caption">{t.code} · {t.departLocal}</T>
                  </View>
                  <StatusPill level={o.level}>{o.label}</StatusPill>
                  <ChevronRight size={18} color={c.text3} />
                </Press>
              </View>
            );
          })}
          <Divider />
        </View>
      )}

      <T v="caption" style={{ marginTop: 28, paddingHorizontal: 2 }}>Don't just track the flight. FlightIQ watches your aircraft, the weather and the roads so you don't have to.</T>
    </Screen>
  );
}
