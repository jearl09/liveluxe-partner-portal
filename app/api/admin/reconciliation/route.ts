/**
 * GET /api/admin/reconciliation — the latest Stripe reconciliation (spec §11.6).
 *   ?format=csv   the Xero-compatible export of the period's balance transactions
 *   (default)     JSON: run summary + open exceptions
 * Finance and admin only (RLS on reconciliation_runs / reconciliation_exceptions).
 */
import { fail, ok, withApi } from "@/lib/api/response";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi<unknown>("/api/admin/reconciliation", async (req, _ctx, { requestId }) => {
  const claims = await getSessionClaims();
  if (!claims) return fail("UNAUTHENTICATED", requestId);
  if (claims.role !== "livluxe_finance" && claims.role !== "livluxe_admin") return fail("FORBIDDEN", requestId);

  const supabase = await createServerSupabase();
  const url = new URL(req.url);
  const system = url.searchParams.get("system") === "hostaway" ? "hostaway" : "stripe";
  const { data: run } = await supabase
    .from("reconciliation_runs")
    .select("*")
    .eq("system", system)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return fail("NOT_FOUND", requestId, { detail: "No reconciliation run yet." });

  if (url.searchParams.get("format") === "csv") {
    const day = run.created_at.slice(0, 10);
    return new Response(run.csv ?? "", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="reconciliation-${system}-${day}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const { data: exceptions } = await supabase
    .from("reconciliation_exceptions")
    .select("*")
    .eq("system", system)
    .is("resolved_at", null)
    .order("first_seen_at", { ascending: true })
    .limit(500);
  return ok({ run, exceptions: exceptions ?? [] }, { requestId });
});
