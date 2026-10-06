/** POST /api/auth/sign-out — clears the session and returns to /login. */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${new URL(req.url).origin}/login`, 303);
}
