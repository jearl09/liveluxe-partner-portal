import { redirect } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { PartnerForm } from "@/components/admin/partner-form";
import { Flash } from "@/components/requests/flash";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Sheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { STATUS_TONE_CLASSES, pillClass } from "@/components/ui/status-pill";
import { loadPartners, type PartnerListRow } from "@/lib/admin/partners";
import { getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import {
  ORG_STATUS_LABELS,
  ORG_TONE,
  PARTNER_TYPE_LABELS,
  PAY_MODE_SHORT,
  type OrgStatus,
  type PartnerType,
} from "@/lib/domain/partners";
import { can } from "@/lib/domain/permissions";
import { rateCardDiscount } from "@/lib/domain/rate-card-display";
import { cn, formatWhen } from "@/lib/utils";

export const metadata = { title: "Partners" };
export const dynamic = "force-dynamic";
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
  "paymentTerms",
  "creditLimit",
  "depositPct",
  "financeContactEmail",
];

/**
 * Partners (brief §6.5): who are our partners and is anything wrong with any of them.
 * Counts in the subtitle, one row per organisation with terms, rate card, people, open
 * requests and money owed, and "New partner" in a Sheet. Live Luxe admin only.
 */
export default async function PartnersPage({ searchParams }: PageProps<"/admin/partners">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "partners.manage")) redirect("/admin/queue");
  const sp = await searchParams;
  const now = new Date();
  const rows = await loadPartners(todayIn("Australia/Melbourne"));
  const values = Object.fromEntries(FORM_KEYS.map((k) => [k, str(sp[k])]));
  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const count = (s: OrgStatus) => rows.filter((r) => r.org.status === s).length;

  const columns: DataTableColumn<PartnerListRow>[] = [
    {
      key: "org",
      header: "Organisation",
      primary: true,
      cell: (r) => (
        <span className="block">
          <span className="text-text-primary block font-semibold">{r.org.name}</span>
          <span className="text-text-muted block">{PARTNER_TYPE_LABELS[r.org.type as PartnerType] ?? r.org.type}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      status: true,
      cell: (r) => (
        <span className={cn(pillClass, STATUS_TONE_CLASSES[ORG_TONE[r.org.status as OrgStatus] ?? "neutral"])}>
          {ORG_STATUS_LABELS[r.org.status as OrgStatus] ?? r.org.status}
        </span>
      ),
    },
    {
      key: "pay",
      header: "Payment",
      cell: (r) => <span className="text-text-primary whitespace-nowrap">{PAY_MODE_SHORT[r.org.payment_terms]}</span>,
    },
    {
      key: "card",
      header: "Rate card",
      optional: true,
      cell: (r) =>
        r.rateCard ? (
          <span className="block max-w-48">
            <span className="text-text-primary block truncate">{r.rateCard.row.name}</span>
            <span className="text-text-muted block">{rateCardDiscount(r.rateCard.card)}</span>
          </span>
        ) : (
          <span className="text-text-muted">Hostaway rate</span>
        ),
    },
    {
      key: "people",
      header: "People",
      numeric: true,
      cell: (r) => (
        <span className="block">
          <span className="text-text-primary">{r.users}</span>
          {r.openInvitations > 0 && <span className="text-text-muted block">+{r.openInvitations} invited</span>}
        </span>
      ),
    },
    {
      key: "open",
      header: "Open requests",
      numeric: true,
      cell: (r) => <span className="text-text-primary">{r.openRequests}</span>,
    },
    {
      key: "owed",
      header: "Outstanding",
      numeric: true,
      cell: (r) =>
        r.outstandingCents > 0 ? (
          <span className={cn("block", r.overdue ? "text-danger-fg font-semibold" : "text-text-primary")}>
            {formatMoney(r.outstandingCents, "AUD")}
            {r.overdue && <span className="block font-normal">overdue</span>}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "last",
      header: "Last activity",
      optional: "xl",
      cell: (r) => (
        <span className="text-text-muted whitespace-nowrap">
          {r.lastActivityAt ? formatWhen(r.lastActivityAt, now) : "None yet"}
        </span>
      ),
    },
  ];

  const create = (
    <Sheet
      title="New partner"
      description="Creates the organisation. Invite its first administrator from the next page."
      size="lg"
      defaultOpen={errorFields.size > 0}
      trigger={
        <Button variant="primary" className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden /> New partner
        </Button>
      }
    >
      <PartnerForm action="/api/admin/partners" values={values} errorFields={errorFields} mode="create" />
    </Sheet>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow mb-1">Accounts</p>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">Partners</h1>
          <p className="text-text-secondary mt-1">
            {count("active")} active · {count("pending")} pending · {count("suspended")} suspended
          </p>
        </div>
        {create}
      </header>
      <Flash
        toast
        done={str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
      />
      <div className="border-subtle bg-surface rounded-card overflow-clip border">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.org.id}
          rowHref={(r) => `/admin/partners/${r.org.id}`}
          rowLabel={(r) => `Open ${r.org.name}`}
          dense
          caption="Partner organisations"
          empty={
            <EmptyState
              icon={Building2}
              title="No partners yet"
              body="Add the first insurer, corporate or agency, then invite its administrator."
              action={create}
            />
          }
        />
      </div>
    </div>
  );
}
