/**
 * Read models for partner organisations, their people and open invitations
 * (spec §2.2, §8.1, §13.4 "Partners"). RLS scopes the rows: a partner admin sees
 * their own organisation, Live Luxe sees all.
 */
import "server-only";
import { createServerSupabase } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";

export type PartnerOrgRow = Database["public"]["Tables"]["partner_orgs"]["Row"];
export type PartnerUserRow = Database["public"]["Tables"]["partner_users"]["Row"];
export type InvitationRow = Database["public"]["Tables"]["invitations"]["Row"];

export interface OrgSummary {
  org: PartnerOrgRow;
  users: number;
  openInvitations: number;
}

/** Every partner organisation (the internal Live Luxe org excluded), with headcounts. */
export async function listOrgs(): Promise<OrgSummary[]> {
  const supabase = await createServerSupabase();
  const [{ data: orgs, error }, { data: users }, { data: invites }] = await Promise.all([
    supabase.from("partner_orgs").select("*").eq("is_internal", false).order("name"),
    supabase.from("partner_users").select("org_id"),
    supabase.from("invitations").select("org_id, accepted_at, expires_at"),
  ]);
  if (error) throw new Error(`partner_orgs read failed: ${error.message}`);
  const now = Date.now();
  const userCount = new Map<string, number>();
  for (const u of users ?? []) userCount.set(u.org_id, (userCount.get(u.org_id) ?? 0) + 1);
  const inviteCount = new Map<string, number>();
  for (const i of invites ?? [])
    if (!i.accepted_at && Date.parse(i.expires_at) > now)
      inviteCount.set(i.org_id, (inviteCount.get(i.org_id) ?? 0) + 1);
  return (orgs ?? []).map((org) => ({
    org,
    users: userCount.get(org.id) ?? 0,
    openInvitations: inviteCount.get(org.id) ?? 0,
  }));
}

export async function getOrg(id: string): Promise<PartnerOrgRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("partner_orgs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`partner_orgs read failed: ${error.message}`);
  return data;
}

export interface OrgPeople {
  users: PartnerUserRow[];
  /** Open (unaccepted, unexpired) invitations. */
  invitations: InvitationRow[];
}

export async function listOrgPeople(orgId: string): Promise<OrgPeople> {
  const supabase = await createServerSupabase();
  const [{ data: users, error: uErr }, { data: invitations, error: iErr }] = await Promise.all([
    supabase.from("partner_users").select("*").eq("org_id", orgId).order("created_at"),
    supabase
      .from("invitations")
      .select("*")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  if (uErr) throw new Error(`partner_users read failed: ${uErr.message}`);
  if (iErr) throw new Error(`invitations read failed: ${iErr.message}`);
  return { users: users ?? [], invitations: invitations ?? [] };
}
