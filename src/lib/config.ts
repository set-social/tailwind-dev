import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@env";

/**
 * Client-side config — intentionally just Supabase's URL + anon key (safe
 * to ship; RLS protects the data). ANTHROPIC_API_KEY, AEROAPI_KEY, and the
 * OpenSky credentials are NOT here: they're Supabase Edge Function secrets
 * (see supabase/functions/) set with `supabase secrets set`, so they never
 * end up inside this app's compiled bundle, where anyone could extract them
 * (`strings` on a built binary). Go through supabase.functions.invoke(...)
 * (see providers/assistantProvider.ts, providers/flightProvider.ts) for
 * anything that needs one of those keys.
 */
export const config = {
  supabaseUrl: SUPABASE_URL || null,
  supabaseAnonKey: SUPABASE_ANON_KEY || null,
};

export const hasDatabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/**
 * Both ultimately gate on Supabase being reachable; whether the *specific*
 * server-side key (ANTHROPIC_API_KEY / AEROAPI_KEY) is actually set is
 * checked inside the Edge Function itself, which returns 501 if not —
 * providers treat that the same as "not configured" and fall back to mock.
 */
export const hasLiveFlightData = hasDatabase;
export const hasLiveAssistant = hasDatabase;
