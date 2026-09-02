import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Paths that must stay reachable without a session.
 *
 * Respondents are not users: they arrive with a form's public token and never
 * sign in. Gating these would break the only flow that collects data.
 */
const PUBLIC_PREFIXES = ["/signin", "/auth", "/forms", "/api/forms/public"];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without credentials there is no auth to enforce. Fail open so local
  // development without a Supabase project still runs, rather than locking
  // every route behind a sign-in that cannot succeed.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Refreshes an expiring session as a side effect; do not remove.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    // API callers get a status they can act on; humans get the sign-in page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "You must be signed in to do this." }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/signin";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  // A signed-in user has no reason to see the sign-in page.
  if (user && pathname === "/signin") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
