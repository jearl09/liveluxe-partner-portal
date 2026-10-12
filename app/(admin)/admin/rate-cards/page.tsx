import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, tdClass, thClass, theadClass } from "@/components/ui/table";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { describeRateCard } from "@/lib/domain/rate-cards";
import { listOrgs } from "@/lib/partners/load";
import { currentRateCardsByOrg } from "@/lib/rate-cards/load";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Rate cards" };
const TZ = "Australia/Melbourne";

/** One row per partner organisation with the card in force today (§13.4). */
export default async function RateCardsPage() {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "rate_cards.manage")) redirect("/admin/queue");
  const today = todayIn(TZ);
  const [orgs, current] = await Promise.all([listOrgs(), currentRateCardsByOrg(today)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pricing"
        title="Rate cards"
        description="Each partner's contracted discount, applied on top of the Hostaway rate when they price a stay."
      />
      <Panel flush>
        <Table>
          <thead className={theadClass}>
            <tr className="border-border border-b">
              <th className={thClass}>Partner</th>
              <th className={thClass}>Current card</th>
              <th className={thClass}>Terms</th>
              <th className={thClass}>Valid</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-5 py-10 text-center">
                  No partner organisations yet. Add one under Partners.
                </td>
              </tr>
            )}
            {orgs.map(({ org }) => {
              const c = current.get(org.id);
              return (
                <tr
                  key={org.id}
                  className="border-border hover:bg-muted/50 relative border-b transition-colors last:border-0"
                >
                  <td className={tdClass}>
                    <Link
                      href={`/admin/rate-cards/${org.id}`}
                      className="text-strong focus-visible:after:ring-ring font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset"
                    >
                      {org.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">
                      {PARTNER_TYPE_LABELS[org.type as PartnerType] ?? org.type}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {c ? (
                      <>
                        <span className="text-strong">{c.row.name}</span>
                        <span className="text-muted-foreground block text-xs">version {c.row.version}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">None — Hostaway rate applies</span>
                    )}
                  </td>
                  <td className={`${tdClass} text-foreground text-xs`}>{c ? describeRateCard(c.card) : "—"}</td>
                  <td className={`${tdClass} text-xs whitespace-nowrap`}>
                    {c ? `${formatDate(c.validFrom)} → ${c.validTo ? formatDate(c.validTo) : "open"}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
