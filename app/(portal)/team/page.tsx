import { cookies } from "next/headers";
import { Flash } from "@/components/requests/flash";
import { PeoplePanel } from "@/components/team/people-panel";
import { PageHeader } from "@/components/ui/page-header";
import { INVITE_LINK_COOKIE } from "@/lib/auth/invite-link";
import { getSessionClaims } from "@/lib/db/server";
import { can, USER_ROLES } from "@/lib/domain/permissions";
import { listOrgPeople } from "@/lib/partners/load";

export const metadata = { title: "Team" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * The partner's own people (§2.2, §8.1). Everyone in the organisation can see who has
 * access; only administrators can invite, revoke or remove access.
 */
export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const [claims, sp, jar] = await Promise.all([getSessionClaims(), searchParams, cookies()]);
  if (!claims) return null; // the layout already redirected
  const people = await listOrgPeople(claims.org_id);
  const manages = can(claims.role, "org.manage_users");
  const inviteLink = str(sp.done) === "invited_nomail" ? (jar.get(INVITE_LINK_COOKIE)?.value ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organisation"
        title="Team"
        description={
          manages
            ? "Invite colleagues and manage who can book on your organisation's behalf."
            : "People in your organisation with access to the portal. Ask an administrator to make changes."
        }
      />
      <Flash done={str(sp.done) || undefined} error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />
      {manages ? (
        <PeoplePanel
          action="/api/team"
          users={people.users}
          invitations={people.invitations}
          roles={USER_ROLES.filter((r) => r.startsWith("partner_"))}
          currentUserAuthId={claims.sub}
          inviteLink={inviteLink}
          errorFields={new Set(str(sp.fields).split(",").filter(Boolean))}
          values={{ email: str(sp.email), role: str(sp.role) }}
        />
      ) : (
        <section className="border-cream-200 rounded-xl border bg-white">
          <ul className="divide-cream-200 divide-y text-sm">
            {people.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-navy-900">{u.full_name ?? "—"}</span>
                  <span className="text-ink-500 block text-xs">{u.email}</span>
                </div>
                <span className="text-ink-700 text-xs capitalize">{u.role.replace("partner_", "")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
