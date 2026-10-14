import { redirect } from "next/navigation";
import { Percent } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { getSessionClaims } from "@/lib/db/server";
import { addDays, daysBetween, todayIn } from "@/lib/domain/dates";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { rateCardDiscount, rateCardTiers, rateCardWaivers } from "@/lib/domain/rate-card-display";
import { listOrgs, type PartnerOrgRow } from "@/lib/partners/load";
import { currentRateCardsByOrg, listRateCards, type RateCardVersion } from "@/lib/rate-cards/load";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Rate cards" };
export const dynamic = "force-dynamic";
const TZ = "Australia/Melbourne";

interface Row {
  org: PartnerOrgRow;
  current: RateCardVersion | null;
  next: RateCardVersion | null;
}

/**
 * Rate cards (brief §6.6): what discount each partner gets, until when. One row per
 * partner; publishing is per partner, so the page has no primary action.
 */
export default async function RateCardsPage() {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "rate_cards.manage")) redirect("/admin/queue");
  const today = todayIn(TZ);
  const [orgs, current] = await Promise.all([listOrgs(), currentRateCardsByOrg(today)]);
  const scheduled = await Promise.all(
    orgs.map(async ({ org }) => (await listRateCards(org.id, today)).filter((v) => v.validFrom > today).at(-1) ?? null),
  );
  const rows: Row[] = orgs.map(({ org }, i) => ({ org, current: current.get(org.id) ?? null, next: scheduled[i] }));

  const columns: DataTableColumn<Row>[] = [
    {
      key: "partner",
      header: "Partner",
      primary: true,
      cell: (r) => (
        <span className="block">
          <span className="text-text-primary block font-semibold">{r.org.name}</span>
          <span className="text-text-muted block">{PARTNER_TYPE_LABELS[r.org.type as PartnerType] ?? r.org.type}</span>
        </span>
      ),
    },
    {
      key: "card",
      header: "Card in force",
      cell: (r) =>
        r.current ? (
          <span className="text-text-primary">{r.current.row.name}</span>
        ) : (
          <span className="text-text-muted">Hostaway rate applies</span>
        ),
    },
    {
      key: "discount",
      header: "Discount",
      cell: (r) => (
        <span className="text-text-primary whitespace-nowrap">
          {r.current ? rateCardDiscount(r.current.card) : "—"}
        </span>
      ),
    },
    {
      key: "tiers",
      header: "Length-of-stay tiers",
      optional: true,
      cell: (r) => <span className="text-text-secondary">{(r.current && rateCardTiers(r.current.card)) ?? "—"}</span>,
    },
    {
      key: "fees",
      header: "Fee waivers",
      optional: "xl",
      cell: (r) => <span className="text-text-secondary">{(r.current && rateCardWaivers(r.current.card)) ?? "—"}</span>,
    },
    {
      key: "valid",
      header: "Valid",
      cell: (r) => {
        if (!r.current) return <span className="text-text-muted">—</span>;
        const last = r.current.validTo ? addDays(r.current.validTo, -1) : null;
        const left = last ? daysBetween(today, last) : null;
        return (
          <span className="block whitespace-nowrap">
            <span className="text-text-primary block">
              {formatDate(r.current.validFrom)} to {last ? formatDate(last) : "open-ended"}
            </span>
            {left !== null && left <= 30 && (
              <span className={cn("block font-semibold", "text-attention-fg")}>
                {left <= 0 ? "Ends today" : `Ends in ${left} ${left === 1 ? "day" : "days"}`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "next",
      header: "Next version",
      optional: true,
      cell: (r) =>
        r.next ? (
          <span className="block">
            <span className="text-text-primary block">{r.next.row.name}</span>
            <span className="text-text-muted block">from {formatDate(r.next.validFrom)}</span>
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-1">Pricing</p>
        <h1 className="text-h1 text-text-primary font-serif tracking-tight">Rate cards</h1>
        <p className="text-text-secondary mt-1">
          Each partner&apos;s contracted discount, applied on top of the Hostaway rate. Open a partner to publish a new
          version.
        </p>
      </header>
      <div className="border-subtle bg-surface rounded-card overflow-clip border">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.org.id}
          rowHref={(r) => `/admin/rate-cards/${r.org.id}`}
          rowLabel={(r) => `Open ${r.org.name}'s rate card`}
          dense
          caption="Rate cards by partner"
          empty={
            <EmptyState
              icon={Percent}
              title="No partners yet"
              body="Rate cards belong to partners. Add a partner first, then publish its card."
            />
          }
        />
      </div>
    </div>
  );
}
