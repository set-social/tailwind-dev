import { supabase } from "@/lib/supabase";
import type { DriveTimeInfo } from "@/lib/types";

/**
 * Calls the `drive-time` Edge Function (Google Routes API, traffic-aware —
 * GOOGLE_ROUTES_API_KEY stays server-side). `arriveBy` should be an ISO
 * instant (e.g. LiveFlight.boardByEarliestIso), not a display string.
 */
export async function fetchDriveTime(
  originLat: number,
  originLng: number,
  destinationAirport: string,
  arriveBy: string,
): Promise<DriveTimeInfo | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke("drive-time", {
      body: { originLat, originLng, destinationAirport, arriveBy },
    });
    if (error || !data || data.error) return null;
    return data as DriveTimeInfo;
  } catch {
    return null;
  }
}
