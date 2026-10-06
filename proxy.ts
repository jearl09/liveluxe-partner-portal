/**
 * Request proxy (Next.js 16 — formerly middleware.ts).
 *  - Refreshes the Supabase session cookie on every request.
 *  - Redirects unauthenticated users away from (portal) and (admin) routes.
 *  - Keeps partner roles out of /admin and livluxe roles' admin console separate.
 *  - Attaches X-Request-Id so every log line and error envelope can be correlated.
 *
 * This is the first of three authorisation layers (UI affordance → server route
 * guard → RLS). It is a convenience, not the boundary. RLS is the boundary (§8.3).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/invite",
  "/reset-password",
  "/mfa",
  "/api/auth",
  "/api/health",
  "/api/webhooks",
  "/api/cron",
];
// Design-review previews with sample data; the route itself 404s in production.
if (process.env.VERCEL_ENV !== "production") PUBLIC_PATHS.push("/dev");

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? `req_${crypto.randomUUID()}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Not configured yet: let public routes through, send everything else to /login with a hint.
    const path = request.nextUrl.pathname;
    const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("setup", "supabase");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response.headers.set("x-request-id", requestId);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { user_role?: string | null; aal?: string | null } | undefined;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  const role = String(claims?.user_role ?? "");
  const isLivluxe = role.startsWith("livluxe_");

  // Signed in, but the JWT carries no role: the custom access token hook is not enabled
  // (or the user has no active partner_users row). Explain instead of looping.
  if (claims && !claims.user_role && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("setup", "hook");
    return NextResponse.redirect(url);
  }

  if (!claims && !isPublic) {
    // API callers get the standard error envelope (§16.1), not an HTML redirect.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Authentication required.", details: {}, requestId } },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (claims && path.startsWith("/admin") && !isLivluxe) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // MFA is opt-in. The per-session code prompt for users who enrolled is enforced in the
  // (portal) and (admin) layouts, which can see whether a verified factor exists; the JWT cannot.

  if (claims && claims.user_role && path === "/login") {
    return NextResponse.redirect(new URL(isLivluxe ? "/admin/queue" : "/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
