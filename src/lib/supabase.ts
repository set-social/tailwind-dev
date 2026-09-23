import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { config, hasDatabase } from "@/lib/config";

/**
 * Single Supabase client for the app: auth session, RLS-scoped Postgres
 * access (see supabase/migrations), and Edge Function calls (assistant,
 * flight-lookup). `null` until SUPABASE_URL / SUPABASE_ANON_KEY are set in
 * .env — callers go through `hasDatabase` (or the providers, which already
 * do) rather than assuming this is non-null.
 */
export const supabase = hasDatabase
  ? createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Real sign-up: email + password, no code. The project has "Confirm email"
 * turned off (mailer_autoconfirm, set via the Management API), so this
 * returns a session immediately — RootNavigator's listener picks it up.
 */
export async function signUpWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No database configured." };
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No database configured." };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/**
 * "Continue as guest" — a real Supabase auth user (the profiles-on-signup
 * trigger fires for it same as any other), just not tied to an email, so
 * RLS-gated writes (tracked_trips, alerts) work immediately without going
 * through sign-up. Reinstalling the app or switching devices loses it —
 * unlike an email account, there's nothing to sign back into.
 */
export async function continueAsGuest(): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No database configured." };
  const { error } = await supabase.auth.signInAnonymously();
  return { error: error?.message ?? null };
}

/**
 * Clears the session; RootNavigator's onAuthStateChange listener picks
 * this up on its own and swaps back to the sign-up flow — nothing else to
 * wire at the call site.
 */
export async function signOut(): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No database configured." };
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}
