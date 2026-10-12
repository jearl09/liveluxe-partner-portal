import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerForm } from "@/components/admin/partner-form";
import { Flash } from "@/components/requests/flash";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Table, tdClass, thClass, theadClass } from "@/components/ui/table";
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

const STATUS_TONE: Record<OrgStatus, PillTone> = {
  active: "ok",
  pending: "warn",
  suspended: "bad",
  closed: "muted",
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
        <Panel flush className="h-fit">
          <Table>
            <thead className={theadClass}>
              <tr className="border-border border-b">
                <th className={thClass}>Organisation</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>People</th>
                <th className={thClass}>Rules</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-5 py-10 text-center">
                    No partners yet. Create the first one on the right.
                  </td>
                </tr>
              )}
              {orgs.map(({ org, users, openInvitations }) => (
                <tr
                  key={org.id}
                  className="border-border hover:bg-muted/50 relative border-b transition-colors last:border-0"
                >
                  <td className={tdClass}>
                    <Link
                      href={`/admin/partners/${org.id}`}
                      className="text-strong focus-visible:after:ring-ring font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset"
                    >
                      {org.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">
                      {PARTNER_TYPE_LABELS[org.type as PartnerType]}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <Pill tone={STATUS_TONE[org.status as OrgStatus] ?? "neutral"}>
                      {ORG_STATUS_LABELS[org.status as OrgStatus] ?? org.status}
                    </Pill>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {users}
                    {openInvitations > 0 && (
                      <span className="text-muted-foreground block text-xs">{openInvitations} invited</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-foreground text-xs`}>
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
          </Table>
        </Panel>

        <Panel className="h-fit" aria-labelledby="new-partner-heading">
          <PanelHeading id="new-partner-heading" title="New partner" />
          <PartnerForm action="/api/admin/partners" values={values} errorFields={errorFields} mode="create" />
        </Panel>
      </div>
    </div>
  );
}
