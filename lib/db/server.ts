/**
 * RLS-aware Supabase client bound to the current user's session (cookies).
 * Use this from Server Components and Route Handlers for everything a user does.
 * Row-level security is the tenancy boundary (spec §8.3) — this client never bypasses it.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "./types";
import type { SessionClaims, UserRole } from "@/lib/domain/permissions";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const e = env();
  return createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/**
 * Reads the session and its custom claims (org_id, role) populated by the
 * Supabase Auth hook defined in supabase/migrations. Returns null when signed out.
 */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const c = data.claims as Record<string, unknown>;
  if (typeof c.org_id !== "string" || typeof c.user_role !== "string") return null;
  return { sub: String(c.sub), org_id: c.org_id, role: c.user_role as UserRole, email: c.email as string | undefined };
}
