import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PartnerForm } from "@/components/admin/partner-form";
import { Flash } from "@/components/requests/flash";
import { PeoplePanel } from "@/components/team/people-panel";
import { PageHeader } from "@/components/ui/page-header";
import { INVITE_LINK_COOKIE } from "@/lib/auth/invite-link";
import { getSessionClaims } from "@/lib/db/server";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/domain/partners";
import { can, USER_ROLES } from "@/lib/domain/permissions";
import { getOrg, listOrgPeople } from "@/lib/partners/load";

export const metadata = { title: "Partner" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** One partner organisation: settings, people, invitations (§2.2, §8.1, §13.4). Live Luxe admin only. */
export default async function PartnerDetailPage({ params, searchParams }: PageProps<"/admin/partners/[id]">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "partners.manage")) redirect("/admin/queue");
  const [{ id }, sp, jar] = await Promise.all([params, searchParams, cookies()]);
  const [org, people] = await Promise.all([getOrg(id), listOrgPeople(id)]);
  if (!org) notFound();

  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const orgValues: Record<string, string> = {
    name: str(sp.name) || org.name,
    type: str(sp.type) || org.type,
    status: str(sp.status) || org.status,
    abn: str(sp.abn) || (org.abn ?? ""),
    slaHours: str(sp.slaHours) || (org.sla_hours != null ? String(org.sla_hours) : ""),
    billingContactName: str(sp.billingContactName) || (org.billing_contact_name ?? ""),
    billingEmail: str(sp.billingEmail) || (org.billing_email ?? ""),
    emailDomains: str(sp.emailDomains) || org.email_domains.join(", "),
    requireClaimRef: sp.requireClaimRef !== undefined ? str(sp.requireClaimRef) : org.require_claim_ref ? "on" : "",
    requirePoNumber: sp.requirePoNumber !== undefined ? str(sp.requirePoNumber) : org.require_po_number ? "on" : "",
  };
  const inviteLink = str(sp.done) === "invited_nomail" ? (jar.get(INVITE_LINK_COOKIE)?.value ?? null) : null;

  return (
    <div className="space-y-6">
      <Link href="/admin/partners" className="text-ink-700 inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All partners
      </Link>
      <PageHeader
        eyebrow={PARTNER_TYPE_LABELS[org.type as PartnerType]}
        title={org.name}
        description={`Status: ${org.status}`}
        actions={
          <Link href={`/admin/rate-cards/${org.id}`} className="text-navy-900 text-sm underline underline-offset-4">
            Rate card
          </Link>
        }
      />
      <Flash done={str(sp.done) || undefined} error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,440px)]">
        <PeoplePanel
          action={`/api/admin/partners/${org.id}`}
          users={people.users}
          invitations={people.invitations}
          roles={USER_ROLES.filter((r) => (org.is_internal ? r.startsWith("livluxe_") : r.startsWith("partner_")))}
          currentUserAuthId={claims.sub}
          inviteLink={inviteLink}
          errorFields={errorFields}
          values={{ email: str(sp.email), role: str(sp.role) }}
        />
        <section className="border-cream-200 h-fit rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-serif text-lg">Settings</h2>
          <PartnerForm
            action={`/api/admin/partners/${org.id}`}
            values={orgValues}
            errorFields={errorFields}
            mode="edit"
          />
        </section>
      </div>
    </div>
  );
}
