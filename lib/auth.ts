import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthedUser = { id: string; email: string | null };

/**
 * The signed-in user for a route handler, or null.
 *
 * Uses getUser() rather than getSession(): getSession() trusts whatever is in
 * the cookie, which the caller controls. getUser() revalidates against the auth
 * server, so a forged cookie cannot mint an owner id.
 */
export async function getUser(): Promise<AuthedUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email_confirmed_at ? data.user.email ?? null : null };
}

/** Thrown past the route handler's catch to become a 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to do this.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<AuthedUser> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
