import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Check, ChevronLeft, Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Navigation, Plus, RotateCw, Sun,
} from "lucide-react-native";
import { fetchLiveFlight, outlookFromStatus } from "@/lib/providers/flightProvider";
import { fetchDriveTime } from "@/lib/providers/driveTime";
import { fetchProfile, trackTrip } from "@/lib/providers";
import { getCurrentLocation } from "@/lib/location";
import type { Condition, DriveTimeInfo, Level, LiveFlight, TempUnit, WeatherInfo } from "@/lib/types";
import { c, font, levelColor, radius } from "@/theme";
import { Button, Divider, FadeRule, Press, Screen, Skeleton, StatusPill, T } from "@/components/ui";
import { FlightMap } from "@/components/flight/flight-map";
import { HorizonHero } from "@/components/horizon";

/**
 * The real-flight-detail view — schedule, status, gate, terminal,
 * aircraft, real progress along the route, real weather at both
 * airports, the real inbound aircraft's own status, real drive-time
 * leave-by, and a real-signals "Risk factors" panel (current delay,
 * weather, inbound delay — no combined score). Boarding time uses the
 * standard 30-45-min-before-departure convention (AeroAPI has no
 * boarding-time field), clearly labeled as a general guideline, not
 * flight-specific data. Still deliberately missing: a delay-probability
 * forecast and an aircraft-swap-risk score — no real model or data
 * source exists for either.
 *
 * A plain component, not a screen, so both LiveFlightScreen (route-param
 * driven, reached from Search/Trips — has a Back row and an Add button)
 * and the Live tab (LiveScreen — auto-picks today's tracked flight, no
 * back row, already tracked so no Add button) render the exact same real
 * content instead of the tab duplicating (or worse, drifting from) this.
 */
export function LiveFlightView({
  flightNumber,
  date,
  onBack,
  showAddButton = true,
}: {
  flightNumber: string;
  date: string;
  onBack?: () => void;
  showAddButton?: boolean;
}) {
  const [flight, setFlight] = useState<LiveFlight | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [addState, setAddState] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [driveState, setDriveState] = useState<"idle" | "locating" | "computing" | "denied" | "unavailable" | "error" | "done">("idle");
  const [drive, setDrive] = useState<DriveTimeInfo | null>(null);
  // Defaults to "F" before the fetch resolves — matches the profiles
  // table's own column default, so there's never a flash of the wrong unit.
  const [tempUnit, setTempUnit] = useState<TempUnit>("F");

  useEffect(() => {
    fetchProfile().then((p) => setTempUnit(p.tempUnit)).catch((err) => console.error("fetchProfile failed:", err));
  }, []);

  const load = useCallback(() => {
    setStatus("loading");
    fetchLiveFlight(flightNumber, date).then((f) => {
      setFlight(f);
      setStatus(f ? "done" : "error");
    });
  }, [flightNumber, date]);

  useEffect(() => { load(); }, [load]);

  // A "real progress map" should show real progress over time, not one
  // frozen snapshot — quietly refetches (no loading skeleton, no
  // disruption on a transient failure) every 45s while actually airborne,
  // so the aircraft visibly moves on the map while it's open.
  useEffect(() => {
    if (!flight || flight.status !== "departed") return;
    const interval = setInterval(() => {
      fetchLiveFlight(flightNumber, date).then((f) => { if (f) setFlight(f); });
    }, 45000);
    return () => clearInterval(interval);
  }, [flight, flightNumber, date]);

  // Asked for on demand (this button), not silently on screen load — a
  // location-permission prompt should follow something the person did,
  // not just opening a screen.
  const onUseLocation = async () => {
    if (!flight) return;
    setDriveState("locating");
    const loc = await getCurrentLocation();
    if (loc.status === "denied") { setDriveState("denied"); return; }
    if (loc.status === "unavailable") { setDriveState("unavailable"); return; }
    setDriveState("computing");
    const result = await fetchDriveTime(loc.coords.latitude, loc.coords.longitude, flight.origin.code, flight.boardByEarliestIso);
    if (!result) { setDriveState("error"); return; }
    setDrive(result);
    setDriveState("done");
  };

  const onAdd = async () => {
    if (!flight) return;
    setAddState("adding");
    try {
      await trackTrip(flight.flightKey, flight.code);
      setAddState("added");
    } catch (err) {
      console.error("add trip failed:", err);
      setAddState("error");
    }
  };

  const insets = useSafeAreaInsets();
  const airborne = !!flight && flight.status === "departed" && flight.position !== null;
  const progress = flight && flight.status === "departed" ? flight.progressPercent : null;
  const sched = flight ? { dep: flight.estimatedDepart !== flight.scheduledDepart, arr: flight.estimatedArrive !== flight.scheduledArrive } : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen bottomInset topPad={insets.top}>
        {/* Back row + updated time. Fixed height so the planet art below lines up. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 44 }}>
          {onBack ? (
            <Press label="Back" onPress={onBack} hitSlop={0} style={{ width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={22} color={c.text} strokeWidth={1.5} />
            </Press>
          ) : <View />}
          {flight && <Text style={{ fontFamily: font.sans, fontSize: 11.5, color: c.text3 }}>Updated {new Date(flight.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>}
        </View>

        {status === "loading" && (
          <View style={{ marginTop: 20, gap: 18 }} accessibilityLabel="Loading live flight data">
            <Skeleton w={140} h={14} />
            <Skeleton w="100%" h={150} />
            <Skeleton w="60%" h={14} />
          </View>
        )}

        {status === "error" && (
          <View style={{ marginTop: 64, alignItems: "center" }}>
            <T v="display" style={{ textAlign: "center" }}>Couldn't load live data.</T>
            <T style={{ marginTop: 10, textAlign: "center" }}>
              {flightNumber} on {date} didn't come back from AeroAPI — it may not be scheduled for that date, or the lookup timed out.
            </T>
            <Button label="Try again" onPress={load} variant="outline" icon={<RotateCw size={14} color={c.text} />} style={{ marginTop: 24, minWidth: 180 }} />
          </View>
        )}

        {status === "done" && flight && (
          <>
            {/* Planet-limb art behind the header block; this flight's own route, with the aircraft at its real progress. */}
            <View style={{ height: 244 }}>
              <View pointerEvents="none" style={{ position: "absolute", left: -24, right: -24, top: 28, height: 210 }}>
                <HorizonHero
                  variant="detail"
                  origin={flight.origin.code}
                  destination={flight.destination.code}
                  originCity={flight.origin.city}
                  destinationCity={flight.destination.city}
                  progress={progress}
                  planeLabel={flight.code}
                />
              </View>
              <Text style={{ marginTop: 6, fontFamily: font.sansSemi, fontSize: 11.5, letterSpacing: 1.6, textTransform: "uppercase", color: c.cyan }} numberOfLines={1}>
                {flight.code} · {flight.airline}
              </Text>
            </View>

            {/* Telemetry: live figures while airborne, otherwise the schedule and gate. */}
            <View style={{ flexDirection: "row" }}>
              {airborne && flight.position ? (
                <>
                  <Stat label="Altitude" value={flight.position.altitudeFt.toLocaleString()} unit="ft" />
                  <Stat label="Speed" value={String(Math.round(flight.position.groundspeedKts))} unit="kt" />
                  <Stat label="Lands" value={flight.estimatedArrive} align="flex-end" tint={sched?.arr ? c.watch : undefined} />
                </>
              ) : (
                <>
                  <Stat label="Departs" value={flight.estimatedDepart} sub={sched?.dep ? `Scheduled ${flight.scheduledDepart}` : undefined} tint={sched?.dep ? c.watch : undefined} />
                  <Stat label="Arrives" value={flight.estimatedArrive} sub={sched?.arr ? `Scheduled ${flight.scheduledArrive}` : undefined} />
                  <Stat label={flight.terminal ? `Terminal ${flight.terminal}` : "Gate"} value={flight.gate ?? "—"} align="flex-end" muted={!flight.gate} />
                </>
              )}
            </View>

            <FadeRule style={{ marginTop: 16 }} />
            <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <Text style={{ flex: 1, fontFamily: font.displayRegular, fontSize: 21, lineHeight: 27, letterSpacing: -0.42, color: c.text }}>{headline(flight)}</Text>
              <StatusPill level={flight.outlook.level}>{flight.outlook.label}</StatusPill>
            </View>
            {detailLine(flight) !== null && (
              <Text style={{ marginTop: 8, fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: c.text2 }}>{detailLine(flight)}</Text>
            )}

            {showAddButton && (
              <Button
                label={addState === "adding" ? "Adding…" : addState === "added" ? "Added to your trips" : addState === "error" ? "Couldn't add — try again" : "Add to my trips"}
                onPress={onAdd}
                variant={addState === "added" ? "outline" : "violet"}
                disabled={addState === "adding"}
                icon={addState === "added" ? <Check size={16} color={c.ok} /> : <Plus size={16} color={c.bg} strokeWidth={2.2} />}
                style={{ marginTop: 22 }}
              />
            )}

            {/* Real, interactive tracker map — only while actually airborne. */}
            {flight.position && (
              <View style={{ marginTop: 24, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.surfaceBorder }}>
                <FlightMap position={flight.position} originCoords={flight.originCoords} destinationCoords={flight.destinationCoords} />
              </View>
            )}

            <Section title="What we're watching">
              <View style={{ gap: 14 }}>
                <FactorRow
                  level={delayLevel(flight.delayMinutes)}
                  title="Current delay"
                  detail={flight.delayMinutes > 0 ? `Running ${flight.delayMinutes} min behind schedule` : "On schedule"}
                />
                {flight.originWeather && (
                  <FactorRow
                    level={weatherLevel(flight.originWeather)}
                    title={`Weather at ${flight.origin.code}`}
                    detail={`${flight.originWeather.summary} around departure`}
                  />
                )}
                {flight.destinationWeather && (
                  <FactorRow
                    level={weatherLevel(flight.destinationWeather)}
                    title={`Weather at ${flight.destination.code}`}
                    detail={`${flight.destinationWeather.summary} around arrival`}
                  />
                )}
                {flight.inbound && (
                  <FactorRow
                    level={delayLevel(flight.inbound.delayMinutes)}
                    title="Inbound aircraft"
                    detail={flight.inbound.delayMinutes > 0 ? `${flight.inbound.code} running ${flight.inbound.delayMinutes} min behind` : `${flight.inbound.code} on schedule`}
                  />
                )}
              </View>
              <T v="caption" style={{ marginTop: 14 }}>
                Real signals, shown plainly. There's no delay percentage or swap-risk score yet — no validated model exists, so they're left out rather than shown with invented numbers.
              </T>
            </Section>

            {airborne && (
              <Section title="Schedule">
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View>
                    <T v="caption">Departed</T>
                    <Text style={valueStyle}>{flight.estimatedDepart}</Text>
                    {sched?.dep && <T v="caption" style={{ marginTop: 2 }}>Scheduled {flight.scheduledDepart}</T>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <T v="caption">Arrives</T>
                    <Text style={valueStyle}>{flight.estimatedArrive}</Text>
                    {sched?.arr && <T v="caption" style={{ marginTop: 2 }}>Scheduled {flight.scheduledArrive}</T>}
                  </View>
                </View>
              </Section>
            )}

            <Section title="Aircraft & gate">
              <View style={{ gap: 12 }}>
                <Row label="Terminal" value={flight.terminal ?? "Not posted yet"} />
                <Divider />
                <Row label="Gate" value={flight.gate ?? "Not posted yet"} />
                <Divider />
                <Row label="Aircraft type" value={flight.aircraftType ?? "Unknown"} />
                <Divider />
                <Row label="Tail number" value={flight.tailNumber ?? "Unknown"} />
              </View>
            </Section>

            {(flight.originWeather || flight.destinationWeather) && (
              <Section title="Weather">
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <WeatherColumn code={flight.origin.code} weather={flight.originWeather} align="flex-start" unit={tempUnit} />
                  <WeatherColumn code={flight.destination.code} weather={flight.destinationWeather} align="flex-end" unit={tempUnit} />
                </View>
                <T v="caption" style={{ marginTop: 12 }}>Forecast for each airport around its own departure/arrival time, not right now.</T>
              </Section>
            )}

            {flight.inbound && (
              <Section title="Your aircraft">
                <T style={{ fontSize: 13.5 }}>
                  Currently operating <Text style={{ fontFamily: font.sansSemi, color: c.text }}>{flight.inbound.code}</Text>, {flight.inbound.origin} → {flight.inbound.destination}.
                </T>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <StatusPill level={outlookFromStatus(flight.inbound.status, flight.inbound.delayMinutes).level}>
                    {outlookFromStatus(flight.inbound.status, flight.inbound.delayMinutes).label}
                  </StatusPill>
                  <T v="caption">Due {new Date(flight.inbound.estimatedArrival ?? flight.inbound.scheduledArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</T>
                </View>
              </Section>
            )}

            <Section title="Boarding">
              <T style={{ fontSize: 15, color: c.text }}>Plan to be at your gate between {flight.boardByEarliest} and {flight.boardByLatest}.</T>
              <T v="caption" style={{ marginTop: 6 }}>
                AeroAPI doesn't publish an exact boarding time — this is the standard 30-45-min-before-departure window airlines generally use, not data specific to {flight.code}.
              </T>
            </Section>

            <Section title="Leave by">
              {driveState === "idle" && (
                <>
                  <T style={{ fontSize: 13.5 }}>Real, live-traffic drive time from where you are now to {flight.origin.code}.</T>
                  <Button label="Use my location" onPress={onUseLocation} variant="outline" icon={<Navigation size={14} color={c.text} />} style={{ marginTop: 14, alignSelf: "flex-start", minWidth: 200 }} />
                </>
              )}
              {(driveState === "locating" || driveState === "computing") && (
                <View style={{ gap: 8 }}>
                  <Skeleton w="70%" h={22} />
                  <T v="caption">{driveState === "locating" ? "Getting your location…" : "Checking live traffic…"}</T>
                </View>
              )}
              {driveState === "denied" && (
                <T style={{ fontSize: 13.5 }}>Location access was denied — enable it in Settings to get a real leave-by time.</T>
              )}
              {(driveState === "unavailable" || driveState === "error") && (
                <View>
                  <T style={{ fontSize: 13.5 }}>{driveState === "unavailable" ? "Couldn't get your location right now." : "Couldn't reach live traffic data."}</T>
                  <Press label="Try again" onPress={onUseLocation} style={{ marginTop: 10, alignSelf: "flex-start" }}>
                    <Text style={{ fontFamily: font.sansSemi, fontSize: 13.5, color: c.accentBright }}>Try again</Text>
                  </Press>
                </View>
              )}
              {driveState === "done" && drive && (
                <>
                  <Text style={{ fontFamily: font.displayLight, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: c.text }}>
                    {new Date(drive.leaveBy).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </Text>
                  <T v="caption" style={{ marginTop: 4 }}>
                    {drive.driveMinutes} min drive ({drive.distanceKm} km) to {flight.origin.code} with live traffic, to be at your gate by {flight.boardByEarliest}.
                  </T>
                </>
              )}
            </Section>
          </>
        )}
      </Screen>
    </View>
  );
}

const valueStyle = { fontFamily: font.displayLight, fontSize: 22, lineHeight: 28, letterSpacing: -0.44, color: c.text, marginTop: 2 } as const;

/** "6:45 PM" -> ["6:45", "PM"]. */
function splitAmPm(t: string): [string, string] {
  const m = t.match(/^(.*?)\s*([AP]M)$/i);
  return m ? [m[1], m[2].toUpperCase()] : [t, ""];
}

/** One telemetry figure: an eyebrow label over a thin Sora value, with an optional unit or a scheduled-time caption. */
function Stat({ label, value, unit, sub, align = "flex-start", tint, muted }: {
  label: string; value: string; unit?: string; sub?: string; align?: "flex-start" | "flex-end"; tint?: string; muted?: boolean;
}) {
  const [main, suffix] = unit ? [value, unit] : splitAmPm(value);
  return (
    <View style={{ flex: 1, alignItems: align }}>
      <Text numberOfLines={1} style={{ fontFamily: font.sansSemi, fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: tint ?? c.text3 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: 5, fontFamily: font.displayLight, fontSize: 22, lineHeight: 28, letterSpacing: -0.44, color: muted ? c.text3 : c.text }}>
        {main}{suffix !== "" && <Text style={{ fontSize: 12, letterSpacing: 0, color: c.text2 }}> {suffix}</Text>}
      </Text>
      {sub && <Text style={{ marginTop: 2, fontFamily: font.sans, fontSize: 11, color: c.text3 }}>{sub}</Text>}
    </View>
  );
}

/** A flat, hairline-topped section — the Horizon replacement for the old stack of cards. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <FadeRule />
      <Text style={{ marginTop: 16, marginBottom: 14, fontFamily: font.sansSemi, fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.text3 }}>{title}</Text>
      {children}
    </View>
  );
}

/** A plain-language headline from the flight's real status — never a forecast. */
function headline(f: LiveFlight): string {
  if (f.status === "cancelled") return "This flight has been cancelled.";
  if (f.status === "diverted") return "This flight has been diverted.";
  if (f.status === "landed") return `Landed at ${f.destination.code}.`;
  if (f.status === "departed") return f.progressPercent !== null ? `${f.progressPercent}% of the way to ${f.destination.city || f.destination.code}.` : "In the air and on its way.";
  if (f.delayMinutes >= 60) return `Running ${Math.floor(f.delayMinutes / 60)}h ${f.delayMinutes % 60}m behind schedule.`;
  if (f.delayMinutes > 0) return `Running ${f.delayMinutes} min behind schedule.`;
  return "On schedule right now.";
}

/** The one supporting sentence worth saying under the headline, from real fields only. */
function detailLine(f: LiveFlight): string | null {
  if (f.status === "landed" || f.status === "cancelled" || f.status === "diverted") return null;
  if (f.status !== "departed" && f.inbound) {
    const due = new Date(f.inbound.estimatedArrival ?? f.inbound.scheduledArrival).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return f.inbound.delayMinutes > 0
      ? `Your aircraft is operating ${f.inbound.code} from ${f.inbound.origin}, running ${f.inbound.delayMinutes} min behind and due at ${due}.`
      : `Your aircraft is operating ${f.inbound.code} from ${f.inbound.origin} and is on schedule, due at ${due}.`;
  }
  return null;
}

const conditionIcon: Record<Condition, typeof Sun> = {
  clear: Sun,
  partly: CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  fog: CloudFog,
};

/** Open-Meteo always returns Celsius — converted here for display only, never stored converted. */
function displayTemp(tempC: number, unit: TempUnit): string {
  return unit === "F" ? `${Math.round(tempC * 9 / 5 + 32)}°F` : `${Math.round(tempC)}°C`;
}

function WeatherColumn({ code, weather, align, unit }: { code: string; weather: WeatherInfo | null; align: "flex-start" | "flex-end"; unit: TempUnit }) {
  if (!weather) {
    return (
      <View style={{ alignItems: align }}>
        <T v="caption">{code}</T>
        <T style={{ fontSize: 13, marginTop: 4 }}>Unavailable</T>
      </View>
    );
  }
  const Icon = conditionIcon[weather.condition];
  return (
    <View style={{ alignItems: align }}>
      <T v="caption">{code}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
        <Icon size={18} color={c.text2} />
        <Text style={{ fontFamily: font.displayLight, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: c.text }}>{displayTemp(weather.tempC, unit)}</Text>
      </View>
      <T v="caption" style={{ marginTop: 2 }}>{weather.summary} · {Math.round(weather.windKph)} km/h wind</T>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T v="caption">{label}</T>
      <T style={{ fontSize: 13.5, color: c.text, fontFamily: font.sansMedium }}>{value}</T>
    </View>
  );
}

/** Real thresholds on real numbers (delay minutes, weather condition) — not a combined score. */
function delayLevel(minutes: number): Level {
  if (minutes >= 30) return "risk";
  if (minutes >= 10) return "watch";
  return "good";
}

function weatherLevel(w: WeatherInfo): Level {
  if (w.condition === "storm") return "risk";
  if (w.condition === "rain" || w.condition === "fog") return "watch";
  return "good";
}

function FactorRow({ level, title, detail }: { level: Level; title: string; detail: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: levelColor[level].solid, marginTop: 5 }} />
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 13.5, color: c.text }}>{title}</T>
        <T v="caption" style={{ marginTop: 1 }}>{detail}</T>
      </View>
    </View>
  );
}
