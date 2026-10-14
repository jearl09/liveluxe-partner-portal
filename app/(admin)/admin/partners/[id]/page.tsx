import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { PartnerForm } from "@/components/admin/partner-form";
import { Flash } from "@/components/requests/flash";
import { PeoplePanel } from "@/components/team/people-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { STATUS_TONE_CLASSES, pillClass } from "@/components/ui/status-pill";
import { INVITE_LINK_COOKIE } from "@/lib/auth/invite-link";
import { createServerSupabase, getSessionClaims } from "@/lib/db/server";
import { todayIn } from "@/lib/domain/dates";
import { balanceOf, invoiceStatus } from "@/lib/domain/invoices";
import { formatMoney } from "@/lib/domain/money";
import {
  ORG_STATUS_LABELS,
  ORG_TONE,
  PARTNER_TYPE_LABELS,
  PAY_MODE_SHORT,
  type OrgStatus,
  type PartnerType,
} from "@/lib/domain/partners";
import { PAYMENT_TERMS_LABELS } from "@/lib/domain/payments";
import { can, USER_ROLES } from "@/lib/domain/permissions";
import { rateCardSummary } from "@/lib/domain/rate-card-display";
import { getOrg, listOrgPeople } from "@/lib/partners/load";
import { currentRateCardsByOrg } from "@/lib/rate-cards/load";
import { cn } from "@/lib/utils";

export const metadata = { title: "Partner" };
export const dynamic = "force-dynamic";
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const CONFIRMED = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];

/**
 * One partner (brief §6.5): who they are, how they pay, how this year has gone, and
 * their people. Edit opens the same form as create, pre-filled. Live Luxe admin only.
 */
export default async function PartnerDetailPage({ params, searchParams }: PageProps<"/admin/partners/[id]">) {
  const claims = await getSessionClaims();
  if (!claims || !can(claims.role, "partners.manage")) redirect("/admin/queue");
  const [{ id }, sp, jar] = await Promise.all([params, searchParams, cookies()]);
  const today = todayIn("Australia/Melbourne");
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const supabase = await createServerSupabase();
  const [org, people, cards, { data: reqs }, { data: invoices }] = await Promise.all([
    getOrg(id),
    listOrgPeople(id),
    currentRateCardsByOrg(today),
    supabase
      .from("booking_requests")
      .select("status, total_cents, submitted_at")
      .eq("org_id", id)
      .gte("submitted_at", yearStart),
    supabase
      .from("invoices")
      .select("status, amount_due_cents, amount_paid_cents, due_at, paid_at")
      .eq("org_id", id)
      .in("status", ["open", "uncollectible"]),
  ]);
  if (!org) notFound();
  const card = cards.get(org.id) ?? null;
  const now = new Date();

  const year = reqs ?? [];
  const decided = year.filter((r) => [...CONFIRMED, "APPROVED", "AWAITING_PAYMENT", "DECLINED"].includes(r.status));
  const approved = decided.filter((r) => r.status !== "DECLINED").length;
  const revenue = year.filter((r) => CONFIRMED.includes(r.status)).reduce((a, r) => a + (r.total_cents ?? 0), 0);
  const owed = (invoices ?? []).reduce((a, i) => a + balanceOf(i), 0);
  const overdue = (invoices ?? []).some((i) => invoiceStatus(i, now) === "overdue");

  const errorFields = new Set(str(sp.fields).split(",").filter(Boolean));
  const orgFieldErrors = [...errorFields].some((f) => f !== "email" && f !== "role");
  const orgValues: Record<string, string> = {
    name: str(sp.name) || org.name,
    type: str(sp.type) || org.type,
    status: str(sp.status) || org.status,
    abn: str(sp.abn) || (org.abn ?? ""),
    slaHours: str(sp.slaHours) || (org.sla_hours != null ? String(org.sla_hours) : ""),
    billingContactName: str(sp.billingContactName) || (org.billing_contact_name ?? ""),
    billingEmail: str(sp.billingEmail) || (org.billing_email ?? ""),
    emailDomains: str(sp.emailDomains) || org.email_domains.join(", "),
    paymentTerms: str(sp.paymentTerms) || org.payment_terms,
    creditLimit: str(sp.creditLimit) || (org.credit_limit_cents != null ? String(org.credit_limit_cents / 100) : ""),
    depositPct: str(sp.depositPct) || (org.deposit_pct != null ? String(org.deposit_pct) : ""),
    financeContactEmail: str(sp.financeContactEmail) || (org.finance_contact_email ?? ""),
    requireClaimRef: sp.requireClaimRef !== undefined ? str(sp.requireClaimRef) : org.require_claim_ref ? "on" : "",
    requirePoNumber: sp.requirePoNumber !== undefined ? str(sp.requirePoNumber) : org.require_po_number ? "on" : "",
  };
  const inviteLink = str(sp.done) === "invited_nomail" ? (jar.get(INVITE_LINK_COOKIE)?.value ?? null) : null;
  const chip = "border-subtle bg-surface text-text-primary text-body-sm rounded-pill inline-flex border px-3 py-1";

  const kpis = [
    { label: `Requests in ${today.slice(0, 4)}`, value: String(year.length) },
    {
      label: "Approval rate",
      value: decided.length ? `${Math.round((approved / decided.length) * 100)}%` : "—",
    },
    { label: "Confirmed value", value: formatMoney(revenue, "AUD") },
    { label: "Outstanding", value: formatMoney(owed, "AUD"), alarm: overdue },
  ];

  return (
    <div className="space-y-8">
      <Link
        href="/admin/partners"
        className="text-text-secondary hover:text-text-primary text-body-sm inline-flex items-center gap-1 font-semibold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All partners
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="space-y-3">
          <p className="eyebrow">{PARTNER_TYPE_LABELS[org.type as PartnerType] ?? org.type}</p>
          <h1 className="text-h1 text-text-primary font-serif tracking-tight">{org.name}</h1>
          <ul className="flex flex-wrap gap-2" aria-label="Terms">
            <li className={cn(pillClass, STATUS_TONE_CLASSES[ORG_TONE[org.status as OrgStatus] ?? "neutral"])}>
              {ORG_STATUS_LABELS[org.status as OrgStatus] ?? org.status}
            </li>
            <li className={chip}>{PAY_MODE_SHORT[org.payment_terms]}</li>
            <li className={chip}>{card ? `${card.row.name} · ${rateCardSummary(card.card)}` : "Hostaway rate"}</li>
            {org.require_claim_ref && <li className={chip}>Claim reference required</li>}
            {org.require_po_number && <li className={chip}>PO required</li>}
          </ul>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link
            href={`/admin/bookings?orgId=${org.id}`}
            className={cn(buttonVariants({ variant: "tertiary" }), "flex-1 sm:flex-none")}
          >
            Bookings
          </Link>
          <Link
            href={`/admin/rate-cards/${org.id}`}
            className={cn(buttonVariants({ variant: "secondary" }), "flex-1 sm:flex-none")}
          >
            Rate card
          </Link>
          <Sheet
            title={`Edit ${org.name}`}
            size="lg"
            defaultOpen={orgFieldErrors}
            trigger={
              <Button variant="secondary" className="flex-1 sm:flex-none">
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Button>
            }
          >
            <PartnerForm
              action={`/api/admin/partners/${org.id}`}
              values={orgValues}
              errorFields={errorFields}
              mode="edit"
            />
          </Sheet>
        </div>
      </header>

      <Flash
        audience="ops"
        toast
        done={str(sp.done) || undefined}
        error={str(sp.error) || undefined}
        detail={str(sp.detail) || undefined}
      />

      <section aria-labelledby="overview-heading" className="space-y-3">
        <h2 id="overview-heading">Overview</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <li
              key={k.label}
              className={cn(
                "border-subtle bg-surface rounded-card border p-4",
                k.alarm && "border-danger-border bg-danger-bg",
              )}
            >
              <span
                className={cn("text-body-sm block font-semibold", k.alarm ? "text-danger-fg" : "text-text-secondary")}
              >
                {k.label}
              </span>
              <span
                className={cn(
                  "text-h2 mt-1 block font-semibold tabular-nums",
                  k.alarm ? "text-danger-fg" : "text-text-primary",
                )}
              >
                {k.value}
              </span>
            </li>
          ))}
        </ul>
        <dl className="border-subtle bg-surface rounded-card divide-subtle divide-y border">
          {[
            ["Payment", PAYMENT_TERMS_LABELS[org.payment_terms]],
            ["Decision SLA", org.sla_hours != null ? `${org.sla_hours} business hours` : "Platform default"],
            ["Billing", [org.billing_contact_name, org.billing_email].filter(Boolean).join(" · ") || "Not set"],
            ["Email domains", org.email_domains.join(", ") || "Not set"],
            ["ABN", org.abn ?? "Not set"],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr]">
              <dt className="text-text-muted text-body-sm">{k}</dt>
              <dd className="text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="people-heading" className="space-y-3">
        <h2 id="people-heading">People</h2>
        <PeoplePanel
          action={`/api/admin/partners/${org.id}`}
          users={people.users}
          invitations={people.invitations}
          roles={USER_ROLES.filter((r) => (org.is_internal ? r.startsWith("livluxe_") : r.startsWith("partner_")))}
          currentUserAuthId={claims.sub}
          inviteLink={inviteLink}
          errorFields={errorFields}
          values={{ email: str(sp.email), role: str(sp.role) }}
          emailDomains={org.email_domains}
        />
      </section>
    </div>
  );
}
