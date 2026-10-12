import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerForm } from "@/components/admin/partner-form";
import { Flash } from "@/components/requests/flash";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionClaims } from "@/lib/db/server";
import { ORG_STATUS_LABELS, PARTNER_TYPE_LABELS, type OrgStatus, type PartnerType } from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { listOrgs } from "@/lib/partners/load";

export const metadata = { title: "Partners" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FORM_KEYS = [
  "name",
  "type",
  "abn",
  "slaHours",
  "billingContactName",
  "billingEmail",
  "emailDomains",
  "requireClaimRef",
  "requirePoNumber",
];

const STATUS_TONE: Record<OrgStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  closed: "bg-cream-200 text-ink-700",
};

/** Partner organisations and the form to add one (§13.4). Live Luxe admin only. */
export default async function PartnersPage({ searchParams }: PageProps<"/admin/partners">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "partners.manage")) redirect("/admin/queue");
  const sp = await searchParams;
  const orgs = await listOrgs();
  const values = Object.fromEntries(FORM_KEYS.map((k) => [k, str(sp[k])]));
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title="Partners"
        description="Insurers, corporates and agencies who book through the portal. Each has its own people, rules and rate card."
      />
      <Flash done={str(sp.done) || undefined} error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,440px)]">
        <section className="border-cream-200 overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-ink-500 text-xs tracking-wide uppercase">
              <tr className="border-cream-200 border-b">
                <th className="px-4 py-2.5 font-medium">Organisation</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">People</th>
                <th className="px-3 py-2.5 font-medium">Rules</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-ink-500 px-4 py-10 text-center">
                    No partners yet. Create the first one on the right.
                  </td>
                </tr>
              )}
              {orgs.map(({ org, users, openInvitations }) => (
                <tr key={org.id} className="border-cream-200 hover:bg-cream-50 relative border-b last:border-0">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/partners/${org.id}`}
                      className="text-navy-900 font-medium after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {org.name}
                    </Link>
                    <span className="text-ink-500 block text-xs">{PARTNER_TYPE_LABELS[org.type as PartnerType]}</span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[org.status as OrgStatus] ?? ""}`}>
                      {ORG_STATUS_LABELS[org.status as OrgStatus] ?? org.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">
                    {users}
                    {openInvitations > 0 && (
                      <span className="text-ink-500 block text-xs">{openInvitations} invited</span>
                    )}
                  </td>
                  <td className="text-ink-700 px-3 py-3 align-top text-xs">
                    {[
                      org.require_claim_ref && "claim ref required",
                      org.require_po_number && "PO required",
                      org.sla_hours != null && `${org.sla_hours}h SLA`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "defaults"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="border-cream-200 h-fit rounded-xl border bg-white p-5">
          <h2 className="mb-3 font-serif text-lg">New partner</h2>
          <PartnerForm action="/api/admin/partners" values={values} errorFields={errorFields} mode="create" />
        </section>
      </div>
    </div>
  );
}
