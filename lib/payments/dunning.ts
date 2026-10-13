/**
 * Dunning and credit standing — spec §11.3 (invoice.payment_failed / overdue),
 * §17.2 "Invoice unpaid past terms", §17.2 "Partner exceeds credit limit".
 *
 *   reminders        escalating emails on the configured days past due: billing
 *                    contact first, then the org's admins as well
 *   finance approval past `dunning.finance_approval_after_days` the org's new
 *                    bookings need Live Luxe finance to approve
 *   suspension       past `dunning.suspend_after_days` the org is suspended for
 *                    new bookings; existing bookings are untouched
 *
 * The partner admin is warned of each coming restriction in the reminder before
 * it takes effect. Standing recovers automatically when nothing is overdue.
 */
import "server-only";
import { adminDb } from "@/lib/db/admin";
import type { InvoiceRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/domain/money";
import {
  creditStandingFor,
  daysOverdue,
  dunningRung,
  parseDunningPolicy,
  type CreditStanding,
  type DunningPolicy,
} from "@/lib/domain/payments";
import { sendEmail } from "@/lib/notifications/email";
import { slack } from "@/lib/notifications/slack";
import { InvoiceReminder } from "@/lib/notifications/templates/dunning";
import { log } from "@/lib/observability/logger";
import { formatDate } from "@/lib/utils";

export async function loadDunningPolicy(): Promise<DunningPolicy> {
  const { data } = await adminDb()
    .from("settings")
    .select("key, value")
    .in("key", ["dunning.reminder_days", "dunning.finance_approval_after_days", "dunning.suspend_after_days"]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  return parseDunningPolicy(
    get("dunning.reminder_days"),
    get("dunning.finance_approval_after_days"),
    get("dunning.suspend_after_days"),
  );
}

interface OrgContact {
  id: string;
  name: string;
  billing_email: string | null;
  status: string;
  credit_standing: CreditStanding;
  credit_standing_reason: string | null;
  adminEmails: string[];
}

async function loadOrgContacts(orgIds: string[]): Promise<Map<string, OrgContact>> {
  if (!orgIds.length) return new Map();
  const db = adminDb();
  const [{ data: orgs }, { data: admins }] = await Promise.all([
    db
      .from("partner_orgs")
      .select("id, name, billing_email, status, credit_standing, credit_standing_reason")
      .in("id", orgIds),
    db
      .from("partner_users")
      .select("org_id, email")
      .in("org_id", orgIds)
      .eq("role", "partner_admin")
      .eq("status", "active"),
  ]);
  const map = new Map<string, OrgContact>();
  for (const o of orgs ?? [])
    map.set(o.id, {
      ...o,
      credit_standing: o.credit_standing as CreditStanding,
      adminEmails: (admins ?? []).filter((a) => a.org_id === o.id).map((a) => a.email),
    });
  return map;
}

/** The reminder for one overdue invoice at one rung. Idempotent on (invoice, rung). */
export async function sendInvoiceReminder(
  inv: InvoiceRow,
  org: OrgContact,
  rung: number,
  days: number,
  policy: DunningPolicy,
  requestId: string,
): Promise<boolean> {
  const to = new Set<string>();
  if (org.billing_email) to.add(org.billing_email);
  if (rung >= 2) org.adminEmails.forEach((e) => to.add(e));
  if (!to.size) {
    log.warn("dunning.no_recipient", { requestId, invoice: inv.number ?? inv.stripe_invoice_id, orgId: org.id });
    return false;
  }
  const outstanding = inv.amount_due_cents - inv.amount_paid_cents;
  const financeIn = Math.max(0, policy.financeApprovalAfterDays - days);
  const suspendIn = Math.max(0, policy.suspendAfterDays - days);
  await sendEmail({
    to: [...to],
    subject: `Invoice ${inv.number ?? ""} is ${days} day${days === 1 ? "" : "s"} overdue`.replace("  ", " "),
    idempotencyKey: `dunning:${inv.id}:${rung}`,
    tags: { type: "invoice_reminder", rung: String(rung) },
    template: InvoiceReminder({
      orgName: org.name,
      invoiceNumber: inv.number ?? inv.stripe_invoice_id,
      amountFormatted: formatMoney(outstanding, inv.currency),
      dueLabel: inv.due_at ? formatDate(inv.due_at.slice(0, 10)) : "—",
      daysOverdue: days,
      payUrl: inv.hosted_url ?? `${env().NEXT_PUBLIC_APP_URL}/invoices`,
      financeApprovalInDays: days >= policy.financeApprovalAfterDays ? 0 : financeIn,
      suspensionInDays: days >= policy.suspendAfterDays ? 0 : suspendIn,
      supportEmail: env().EMAIL_REPLY_TO,
    }),
  });
  return true;
}

/** Recompute one org's credit standing from its open invoices and apply it. Returns the standing. */
export async function applyCreditStanding(
  orgId: string,
  policy: DunningPolicy,
  now: Date,
  requestId: string,
): Promise<{ standing: CreditStanding; changed: boolean }> {
  const db = adminDb();
  const [{ data: org }, { data: open }] = await Promise.all([
    db
      .from("partner_orgs")
      .select("id, name, status, credit_standing, credit_standing_reason")
      .eq("id", orgId)
      .maybeSingle(),
    db.from("invoices").select("due_at, amount_due_cents, amount_paid_cents").eq("org_id", orgId).eq("status", "open"),
  ]);
  if (!org) return { standing: "good", changed: false };
  const overdueDays = (open ?? [])
    .filter((i) => i.due_at && i.amount_due_cents - i.amount_paid_cents > 0)
    .map((i) => daysOverdue(i.due_at!, now));
  const maxDays = overdueDays.length ? Math.max(...overdueDays) : null;
  const standing = creditStandingFor(maxDays, policy);
  const current = org.credit_standing as CreditStanding;
  if (standing === current) return { standing, changed: false };

  const patch: {
    credit_standing: CreditStanding;
    credit_standing_changed_at: string;
    credit_standing_reason: string | null;
    status?: string;
  } = {
    credit_standing: standing,
    credit_standing_changed_at: now.toISOString(),
    credit_standing_reason: standing === "good" ? null : `dunning: ${maxDays} days overdue`,
  };
  // Suspension is the org status so the submit RPC blocks new bookings; existing bookings are untouched.
  if (standing === "suspended" && org.status === "active") patch.status = "suspended";
  if (standing !== "suspended" && org.status === "suspended" && org.credit_standing_reason?.startsWith("dunning"))
    patch.status = "active";
  const { error } = await db.from("partner_orgs").update(patch).eq("id", orgId);
  if (error) throw new Error(`partner_orgs update failed: ${error.message}`);
  await db.from("audit_log").insert({
    actor_type: "system",
    action: "org.credit_standing",
    entity_type: "partner_org",
    entity_id: orgId,
    before: { credit_standing: current } as never,
    after: { credit_standing: standing, maxDaysOverdue: maxDays } as never,
    request_id: requestId,
  });
  log.warn("dunning.credit_standing", { requestId, orgId, from: current, to: standing, maxDays });
  if (standing === "finance_approval" || standing === "suspended")
    await slack(
      "alerts",
      `:no_entry: ${org.name} is now *${standing.replace("_", " ")}*: invoices ${maxDays} days overdue. ${standing === "suspended" ? "New bookings blocked; existing bookings untouched." : "New bookings need finance approval."}`,
    );
  else if (current === "finance_approval" || current === "suspended")
    await slack("bookings", `:white_check_mark: ${org.name} credit standing restored to *${standing}*.`);
  return { standing, changed: true };
}

/** The daily sweep. */
export async function runDunning(requestId: string, now = new Date()) {
  const db = adminDb();
  const policy = await loadDunningPolicy();
  const { data: overdue, error } = await db
    .from("invoices")
    .select("*")
    .eq("status", "open")
    .lt("due_at", now.toISOString())
    .limit(500);
  if (error) throw new Error(`invoices read failed: ${error.message}`);
  const rows = (overdue ?? []).filter((i) => i.amount_due_cents - i.amount_paid_cents > 0);
  const orgs = await loadOrgContacts([...new Set(rows.map((i) => i.org_id))]);

  let reminders = 0;
  for (const inv of rows) {
    const org = orgs.get(inv.org_id);
    if (!org || !inv.due_at) continue;
    const days = daysOverdue(inv.due_at, now);
    const rung = dunningRung(days, policy);
    if (rung <= inv.dunning_stage) continue;
    try {
      const sent = await sendInvoiceReminder(inv, org, rung, days, policy, requestId);
      await db
        .from("invoices")
        .update({ dunning_stage: rung, dunning_last_at: now.toISOString() })
        .eq("id", inv.id)
        .eq("dunning_stage", inv.dunning_stage);
      if (sent) reminders++;
    } catch (e) {
      log.error("dunning.reminder_failed", { requestId, invoice: inv.number, error: String(e) });
    }
  }

  // Standing for every org that has (or recently had) open invoices.
  const { data: orgIdsWithOpen } = await db.from("invoices").select("org_id").eq("status", "open").limit(2000);
  const candidates = new Set<string>([...(orgIdsWithOpen ?? []).map((r) => r.org_id), ...rows.map((r) => r.org_id)]);
  const { data: flagged } = await db.from("partner_orgs").select("id").neq("credit_standing", "good");
  (flagged ?? []).forEach((o) => candidates.add(o.id));
  let standingChanges = 0;
  for (const orgId of candidates) {
    try {
      const r = await applyCreditStanding(orgId, policy, now, requestId);
      if (r.changed) standingChanges++;
    } catch (e) {
      log.error("dunning.standing_failed", { requestId, orgId, error: String(e) });
    }
  }
  return {
    examined: rows.length,
    changed: reminders,
    notes: `reminders=${reminders} standingChanges=${standingChanges}`,
  };
}
