import type { AirportWeatherAssessment, Level, WxConditions } from "@/lib/types";

/** What each level is called on screen. */
export const LEVEL_TEXT: Record<Level, string> = { good: "Fine", watch: "Watch", risk: "Risk", neutral: "—" };

export const ROLE_TEXT: Record<AirportWeatherAssessment["role"], string> = {
  departure: "Departure",
  arrival: "Arrival",
  inbound_departure: "Aircraft's earlier leg",
};

export function windLabel(c: WxConditions | null): { main: string; sub: string | null } {
  if (!c || c.windKt === null) return { main: "—", sub: null };
  const dir = c.windDirName ?? "Variable";
  return { main: `${dir} ${Math.round(c.windKt)}`, sub: c.gustKt ? `gusts ${Math.round(c.gustKt)} kt` : "kt, no gusts" };
}

export const visLabel = (mi: number | null): string => (mi === null ? "—" : mi >= 10 ? "10+" : String(mi));

export function ceilingLabel(c: WxConditions | null): { main: string; sub: string | null } {
  if (!c) return { main: "—", sub: null };
  if (c.ceilingFt !== null) return { main: c.ceilingFt.toLocaleString("en-US"), sub: `ft${c.flightCategory ? ` · ${c.flightCategory}` : ""}` };
  return c.source === "Forecast" ? { main: "—", sub: "not forecast" } : { main: "None", sub: c.flightCategory ?? null };
}

export function skyLabel(c: WxConditions | null): { main: string; sub: string | null } {
  if (!c) return { main: "—", sub: null };
  const p = c.precipMmHr;
  return { main: c.summary, sub: p === null ? null : p >= 0.1 ? `${p.toFixed(1)} mm/h` : "no rain" };
}

/** "Wed, Sep 23" -> "Wed" */
export const shortDay = (label: string): string => label.split(",")[0];

export function levelForGust(kt: number): Level {
  return kt >= 35 ? "risk" : kt >= 25 ? "watch" : "good";
}

// ─── wind chart geometry ─────────────────────────────────────────────────

export interface ChartGeometry {
  yMax: number;
  baselineY: number;
  thresholdY: number;
  gustSegments: { x1: number; y1: number; x2: number; y2: number; level: Level }[];
  windPath: string;
  areaPath: string;
  /** Null when the flight time falls outside the plotted range. */
  focusX: number | null;
  ticks: { x: number; label: string }[];
}

const HOUR = 3_600_000;

function localHourAndDay(ms: number, tz: string | null): { hour: number; day: string } {
  try {
    const opt = tz ? { timeZone: tz } : {};
    const hour = parseInt(new Intl.DateTimeFormat("en-US", { ...opt, hour: "numeric", hour12: false }).format(ms), 10) % 24;
    const day = new Intl.DateTimeFormat("en-US", { ...opt, weekday: "short" }).format(ms);
    return { hour: Number.isFinite(hour) ? hour : 0, day };
  } catch {
    const d = new Date(ms);
    return { hour: d.getUTCHours(), day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] };
  }
}

/**
 * Pure layout for the wind chart, so it can be tested without rendering:
 * plots 3-hourly gust and sustained wind across `width` x `height`, marks the
 * flight time, and puts a weekday label at the first bin of each local day.
 */
export function buildChart(
  points: { t: string; windKt: number; gustKt: number }[],
  focusIso: string,
  tz: string | null,
  width: number,
  height: number,
  pad = { top: 18, bottom: 22 },
): ChartGeometry | null {
  if (points.length < 3 || width <= 0) return null;
  const t0 = Date.parse(points[0].t);
  const t1 = Date.parse(points[points.length - 1].t);
  if (!(t1 > t0)) return null;

  const maxGust = Math.max(...points.map((p) => p.gustKt));
  const yMax = Math.max(30, Math.ceil((maxGust + 2) / 5) * 5);
  const plotH = height - pad.top - pad.bottom;
  const x = (ms: number) => ((ms - t0) / (t1 - t0)) * width;
  const y = (kt: number) => pad.top + (1 - Math.min(kt, yMax) / yMax) * plotH;
  const baselineY = pad.top + plotH;

  const xs = points.map((p) => x(Date.parse(p.t)));
  const gustSegments = points.slice(1).map((p, i) => ({
    x1: xs[i], y1: y(points[i].gustKt), x2: xs[i + 1], y2: y(p.gustKt),
    level: levelForGust(Math.max(points[i].gustKt, p.gustKt)),
  }));
  const gustLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${y(p.gustKt).toFixed(1)}`).join(" ");
  const windPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${y(p.windKt).toFixed(1)}`).join(" ");
  const areaPath = `${gustLine} L${xs[xs.length - 1].toFixed(1)} ${baselineY.toFixed(1)} L${xs[0].toFixed(1)} ${baselineY.toFixed(1)} Z`;

  const focusMs = Date.parse(focusIso);
  const focusX = focusMs >= t0 - HOUR && focusMs <= t1 + HOUR ? Math.min(Math.max(x(focusMs), 0), width) : null;

  const ticks: ChartGeometry["ticks"] = [];
  let lastDay = "";
  points.forEach((p, i) => {
    const { hour, day } = localHourAndDay(Date.parse(p.t), tz);
    if (i === 0 || (hour < 3 && day !== lastDay)) ticks.push({ x: xs[i], label: day });
    lastDay = day;
  });

  // The chart usually starts partway through a day, so its first weekday label can sit right next to the following midnight's. Keep the later, fuller day.
  const spaced = ticks.filter((t, i) => i === ticks.length - 1 || ticks[i + 1].x - t.x >= 38);

  return { yMax, baselineY, thresholdY: y(25), gustSegments, windPath, areaPath, focusX, ticks: spaced };
}
