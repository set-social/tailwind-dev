/**
 * "Today" / "Tomorrow" labels for flight times. The day is judged at the
 * airport's own timezone (a 2:53 PM departure from Fayetteville is "tomorrow"
 * as far as that airport is concerned), for both the flight and for "now".
 */

function ymd(d: Date, tz?: string): [number, number, number] {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: tz }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const y = get("year"), m = get("month"), day = get("day");
    if (y && m && day) return [y, m, day];
  } catch {
    // Unknown timezone: fall through to the device's own calendar.
  }
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export interface RelativeDay {
  /** "Today", "Tomorrow", "Yesterday", or e.g. "Thu, Sep 24". */
  label: string;
  /** Whole calendar days from today (negative = past). */
  offset: number;
  /** Always the weekday and date, e.g. "Thu, Sep 24". */
  date: string;
}

export function relativeDay(iso: string | null | undefined, tz?: string | null, now: Date = new Date()): RelativeDay | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const zone = tz ?? undefined;
  const [fy, fm, fd] = ymd(when, zone);
  const [ny, nm, nd] = ymd(now, zone);
  const offset = Math.round((Date.UTC(fy, fm - 1, fd) - Date.UTC(ny, nm - 1, nd)) / 86_400_000);

  let date: string;
  try {
    date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }).format(when);
  } catch {
    date = when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset === -1 ? "Yesterday" : date;
  return { label, offset, date };
}
