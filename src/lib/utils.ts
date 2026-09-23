/** Times are stored as minutes after local midnight so the UI can do math on them. */
export const t = (h: number, m = 0) => h * 60 + m;

export function fmtTime(min: number, opts: { suffix?: boolean } = {}) {
  const { suffix = true } = opts;
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const s = `${h}:${String(m).padStart(2, "0")}`;
  return suffix ? `${s} ${h24 < 12 ? "AM" : "PM"}` : s;
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
