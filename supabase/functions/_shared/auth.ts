import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * The signed-in user's id from the request's own JWT, or null. Deployed
 * functions already reject requests with no valid JWT at all, but that
 * accepts the bare anon key — this insists on a real (email or guest)
 * user, which is what per-user rate limiting needs.
 */
export async function authenticatedUserId(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
