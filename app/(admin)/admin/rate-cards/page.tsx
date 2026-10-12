import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
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
      <div className="border-cream-200 overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-ink-500 text-xs tracking-wide uppercase">
            <tr className="border-cream-200 border-b">
              <th className="px-4 py-2.5 font-medium">Partner</th>
              <th className="px-3 py-2.5 font-medium">Current card</th>
              <th className="px-3 py-2.5 font-medium">Terms</th>
              <th className="px-3 py-2.5 font-medium">Valid</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-ink-500 px-4 py-10 text-center">
                  No partner organisations yet. Add one under Partners.
                </td>
              </tr>
            )}
            {orgs.map(({ org }) => {
              const c = current.get(org.id);
              return (
                <tr key={org.id} className="border-cream-200 hover:bg-cream-50 relative border-b last:border-0">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/rate-cards/${org.id}`}
                      className="text-navy-900 font-medium after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {org.name}
                    </Link>
                    <span className="text-ink-500 block text-xs capitalize">{org.type}</span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {c ? (
                      <>
                        <span className="text-navy-900">{c.row.name}</span>
                        <span className="text-ink-500 block text-xs">version {c.row.version}</span>
                      </>
                    ) : (
                      <span className="text-ink-500">None — Hostaway rate applies</span>
                    )}
                  </td>
                  <td className="text-ink-700 px-3 py-3 align-top text-xs">{c ? describeRateCard(c.card) : "—"}</td>
                  <td className="px-3 py-3 align-top text-xs whitespace-nowrap">
                    {c ? `${formatDate(c.validFrom)} → ${c.validTo ? formatDate(c.validTo) : "open"}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
