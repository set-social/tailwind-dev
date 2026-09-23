import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; reason: "user" | "global"; limit: number }
  | { ok: false; reason: "unavailable" };

/**
 * Atomically counts one assistant call against the caller's UTC-day quota
 * and the global cap (see consume_assistant_call in migration 0004).
 * Fails CLOSED: if the quota backend can't be reached, the call is refused
 * rather than allowed unmetered — an unmetered LLM endpoint is the failure
 * that costs money.
 */
export async function consumeAssistantCall(db: SupabaseClient, userId: string, userLimit: number, globalLimit: number): Promise<QuotaResult> {
  const { data, error } = await db.rpc("consume_assistant_call", {
    p_user_id: userId, p_user_limit: userLimit, p_global_limit: globalLimit,
  });
  if (error || !data) {
    console.error("consume_assistant_call failed:", error?.message);
    return { ok: false, reason: "unavailable" };
  }
  if (data.ok) return { ok: true, used: data.used, limit: userLimit };
  return { ok: false, reason: data.reason === "global" ? "global" : "user", limit: data.reason === "global" ? globalLimit : userLimit };
}
