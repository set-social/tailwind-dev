// Central place for model IDs and tunable limits, so a model swap or a limit
// change is a one-line edit here rather than a hunt through every function.

export const MODELS = {
  /** Reasoning and anything the traveler reads: explanations, recommendations. */
  reasoning: "claude-sonnet-5",
  /** Cheap, fast work — triage, classification, parsing (used from later phases on). */
  triage: "claude-haiku-4-5-20251001",
} as const;

function intEnv(name: string, fallback: number): number {
  const n = parseInt(Deno.env.get(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Questions one user may ask per UTC day. */
export const assistantDailyLimit = () => intEnv("ASSISTANT_DAILY_LIMIT", 25);

/**
 * Questions across ALL users per UTC day — a cost circuit breaker. The
 * per-user limit alone can be sidestepped by creating fresh guest accounts
 * (anonymous sign-in is on), so this caps the worst case regardless.
 */
export const assistantGlobalDailyLimit = () => intEnv("ASSISTANT_GLOBAL_DAILY_LIMIT", 2000);
