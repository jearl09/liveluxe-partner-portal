import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RateCardForm } from "@/components/admin/rate-card-form";
import { Flash } from "@/components/requests/flash";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelHeading } from "@/components/ui/panel";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { describeRateCard } from "@/lib/domain/rate-cards";
import { getOrg } from "@/lib/partners/load";
import { listRateCards } from "@/lib/rate-cards/load";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Rate card" };
const TZ = "Australia/Melbourne";
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function OrgRateCardPage({ params, searchParams }: PageProps<"/admin/rate-cards/[orgId]">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "rate_cards.manage")) redirect("/admin/queue");
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const today = todayIn(TZ);
  const [org, versions] = await Promise.all([getOrg(orgId), listRateCards(orgId, today)]);
  if (!org) notFound();

  const values = Object.fromEntries(
    ["name", "discountPct", "validFrom", "validTo", "losTiers", "cleaningFeeFromNights", "waiveSecurityDeposit"].map(
      (k) => [k, str(sp[k])],
    ),
  );
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));

  return (
    <div className="space-y-6">
      <Link href="/admin/rate-cards" className="text-foreground inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All rate cards
      </Link>
      <PageHeader
        eyebrow="Rate card"
        title={org.name}
        description="Versions are kept; only one is in force on any date."
      />
      <Flash done={str(sp.done) || undefined} error={str(sp.error) || undefined} detail={str(sp.detail) || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
        <Panel flush className="h-fit" aria-labelledby="versions-heading">
          <PanelHeading id="versions-heading" title="Versions" flush />
          {versions.length === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">
              No rate card yet. This partner is quoted the Hostaway rate.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {versions.map((v) => (
                <li key={v.row.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="text-strong font-medium">
                      {v.row.name} <span className="text-muted-foreground font-normal">· v{v.row.version}</span>
                      {v.current && (
                        <span className="bg-accent text-accent-foreground ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                          In force
                        </span>
                      )}
                    </p>
                    <p className="text-foreground text-xs">{describeRateCard(v.card)}</p>
                  </div>
                  <p className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(v.validFrom)} → {v.validTo ? formatDate(v.validTo) : "open"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="h-fit" aria-labelledby="publish-heading">
          <PanelHeading id="publish-heading" title="Publish a new version" />
          <RateCardForm orgId={orgId} today={today} values={values} errorFields={errorFields} />
        </Panel>
      </div>
    </div>
  );
}
