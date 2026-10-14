import { cookies } from "next/headers";
import { Flash } from "@/components/requests/flash";
import { PeoplePanel } from "@/components/team/people-panel";
import { INVITE_LINK_COOKIE } from "@/lib/auth/invite-link";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { can, USER_ROLES } from "@/lib/domain/permissions";
import { listOrgPeople } from "@/lib/partners/load";

export const metadata = { title: "Team" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Team (brief §7.8): who can book for us, and who is waiting to join. Everyone in the
 * organisation can see the list; administrators invite and remove access.
 */
export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const [claims, sp, jar] = await Promise.all([getSessionClaims(), searchParams, cookies()]);
  if (!claims) return null; // the layout already redirected
  const supabase = await createServerSupabase();
  const [people, { data: org }] = await Promise.all([
    listOrgPeople(claims.org_id),
    supabase.from("partner_orgs").select("email_domains").eq("id", claims.org_id).maybeSingle(),
  ]);
  const manages = can(claims.role, "org.manage_users");
  const inviteLink = str(sp.done) === "invited_nomail" ? (jar.get(INVITE_LINK_COOKIE)?.value ?? null) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Team</h1>
        <p className="text-text-secondary mt-1">
          {manages
            ? "Who can book for your organisation, and who is waiting to join."
            : "People in your organisation with access to the portal. An administrator can make changes."}
        </p>
      </header>
      <Flash
        toast
        done={str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
      />
      <PeoplePanel
        action="/api/team"
        users={people.users}
        invitations={manages ? people.invitations : []}
        roles={USER_ROLES.filter((r) => r.startsWith("partner_"))}
        currentUserAuthId={claims.sub}
        inviteLink={inviteLink}
        errorFields={new Set(str(sp.fields).split(",").filter(Boolean))}
        values={{ email: str(sp.email), role: str(sp.role) }}
        manages={manages}
        emailDomains={org?.email_domains ?? []}
      />
    </div>
  );
}
