import type { LeaveInputs } from "./types";

export interface LeavePlan {
  leaveBy: number;
  exactLeave: number;
  boarding: number;
  totalMin: number;
  steps: { id: string; label: string; minutes: number; note: string; icon: string; start: number; end: number }[];
}

/** Work backwards from boarding: leave = boarding − everything that has to happen first, rounded down to 5 min. */
export function computeLeavePlan(inputs: LeaveInputs, boardingStart: number, delayMin: number, bufferOverride?: number): LeavePlan {
  const comps = inputs.components.map((c) => (c.id === "buffer" && bufferOverride != null ? { ...c, minutes: bufferOverride } : c));
  const totalMin = comps.reduce((s, c) => s + c.minutes, 0);
  const boarding = boardingStart + delayMin;
  const exactLeave = boarding - totalMin;
  const leaveBy = Math.floor(exactLeave / 5) * 5;
  let cursor = leaveBy;
  const steps = comps.map((c) => {
    const start = cursor;
    cursor += c.minutes;
    return { ...c, start, end: cursor };
  });
  return { leaveBy, exactLeave, boarding, totalMin, steps };
}
