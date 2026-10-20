import { redirect } from "next/navigation";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { can } from "@/lib/domain/permissions";

/**
 * /admin/team — the Live Luxe staff list and invite form. Staff live in the internal
 * organisation, which the Partners list hides on purpose; this route finds it so nobody
 * needs its id (asked for on 20 Oct 2026).
 */
export const metadata = { title: "Team" };

export default async function AdminTeamPage() {
  const claims = await getSessionClaims();
  if (!claims) redirect("/login");
  if (!can(claims.role, "org.manage_users")) redirect("/admin/queue");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("partner_orgs").select("id").eq("is_internal", true).limit(1).maybeSingle();
  redirect(data ? `/admin/partners/${data.id}#people-heading` : "/admin/queue");
}
