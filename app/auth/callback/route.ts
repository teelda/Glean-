import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point for the magic link.
 *
 * Supabase sends the user here with a one-time `code`; exchanging it sets the
 * session cookie. The link is the credential, so a failed exchange must land on
 * sign-in with an error rather than silently dropping the user on the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only ever redirect within this app: `next` comes from the URL, so an
  // absolute value would turn the sign-in flow into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing-code`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/signin?error=not-configured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=expired`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
