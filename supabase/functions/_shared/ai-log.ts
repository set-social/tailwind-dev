import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AiCallLog {
  user_id: string | null;
  function_name: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  latency_ms: number;
  tool_calls?: number;
  stop_reason?: string | null;
  flight_key?: string | null;
  error?: string | null;
}

/** One row per model call, service-role only (see `ai_calls` in migration 0004). Best-effort: logging must never break the answer. */
export async function logAiCall(db: SupabaseClient, row: AiCallLog): Promise<void> {
  try {
    const { error } = await db.from("ai_calls").insert(row);
    if (error) console.error("ai_calls insert failed:", error.message);
  } catch (err) {
    console.error("ai_calls insert threw:", err);
  }
}
