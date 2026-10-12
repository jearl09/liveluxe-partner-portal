/**
 * sla-escalation — the escalation ladder (spec §10.3, §21.2).
 * Every 10 minutes: for each request waiting on Live Luxe, work out how much of the
 * decision window has elapsed and, when a new rung of the ladder is reached, tell
 * ops once (Slack #bookings, an in-app notification for every ops user, structured
 * log). The rung is stored on the request so a rerun never repeats itself.
 * Counter-offered requests are excluded: their clock is paused (§10.1).
 */
import { adminDb } from "@/lib/db/admin";
import { escalationLabel, nextEscalationRung, QUEUE_STATUSES } from "@/lib/domain/requests";
import { slack } from "@/lib/notifications/slack";
import { log } from "@/lib/observability/logger";
import { env } from "@/lib/env";
import type { JobFn } from "./registry";

const DEFAULT_LADDER = [50, 80, 100, 150];

async function ladderFromSettings(): Promise<number[]> {
  const { data } = await adminDb().from("settings").select("value").eq("key", "sla.escalation_pcts").maybeSingle();
  const v = data?.value;
  return Array.isArray(v) && v.every((n) => typeof n === "number" && n > 0) && v.length
    ? (v as number[])
    : DEFAULT_LADDER;
}

export const slaEscalation: JobFn = async ({ requestId }) => {
  const db = adminDb();
  const now = new Date();
  const [ladder, { data: open, error }, { data: opsIds }] = await Promise.all([
    ladderFromSettings(),
    db
      .from("booking_requests")
      .select(
        "id, reference, org_id, status, submitted_at, decision_due_at, sla_paused_at, sla_escalation_pct, listing_id, total_cents, currency",
      )
      .in("status", [...QUEUE_STATUSES])
      .not("decision_due_at", "is", null)
      .limit(500),
    db.rpc("livluxe_ops_user_ids"),
  ]);
  if (error) throw new Error(`booking_requests read failed: ${error.message}`);

  let escalated = 0;
  let failed = 0;
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  // Names for the messages, looked up once (the hand-maintained types carry no relations).
  const due = (open ?? []).filter((r) =>
    nextEscalationRung(r.submitted_at, r.decision_due_at, now, ladder, r.sla_escalation_pct, {
      paused: !!r.sla_paused_at,
    }),
  );
  const orgIds = [...new Set(due.map((r) => r.org_id))];
  const listingIds = [...new Set(due.map((r) => r.listing_id))];
  const [{ data: orgs }, { data: listings }] = await Promise.all([
    orgIds.length
      ? db.from("partner_orgs").select("id, name").in("id", orgIds)
      : { data: [] as { id: string; name: string }[] },
    listingIds.length
      ? db.from("listings").select("id, public_name").in("id", listingIds)
      : { data: [] as { id: string; public_name: string }[] },
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const listingName = new Map((listings ?? []).map((l) => [l.id, l.public_name]));

  for (const r of open ?? []) {
    const rung = nextEscalationRung(r.submitted_at, r.decision_due_at, now, ladder, r.sla_escalation_pct, {
      paused: !!r.sla_paused_at,
    });
    if (rung === null) continue;
    try {
      // Claim the rung first so two overlapping runs cannot both announce it.
      const { data: claimed, error: uErr } = await db
        .from("booking_requests")
        .update({ sla_escalation_pct: rung })
        .eq("id", r.id)
        .eq("sla_escalation_pct", r.sla_escalation_pct)
        .select("id");
      if (uErr) throw new Error(uErr.message);
      if (!claimed?.length) continue;

      const org = orgName.get(r.org_id) ?? "partner";
      const property = listingName.get(r.listing_id) ?? "property";
      const label = escalationLabel(rung);
      const url = `${appUrl}/admin/bookings/${r.id}`;
      const dueLabel = r.decision_due_at ? new Date(r.decision_due_at).toISOString() : "";

      log.warn("sla.escalation", { requestId, reference: r.reference, rung, status: r.status, due: dueLabel });

      if (opsIds?.length) {
        const { error: nErr } = await db.from("notifications").insert(
          opsIds.map((user_id) => ({
            user_id,
            type: "sla_escalation",
            payload: { bookingId: r.id, reference: r.reference, rung, label, org, property, url } as never,
          })),
        );
        if (nErr)
          log.warn("sla.notification_insert_failed", { requestId, reference: r.reference, error: nErr.message });
      }

      await slack(
        "bookings",
        `${rung >= 100 ? ":rotating_light:" : ":hourglass_flowing_sand:"} *${label}* — ${r.reference} · ${org} · ${property}\n${url}`,
      );
      escalated++;
    } catch (e) {
      failed++;
      log.error("sla.escalation_failed", {
        requestId,
        reference: r.reference,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    examined: open?.length ?? 0,
    changed: escalated,
    notes: `escalated=${escalated} failed=${failed} ladder=${ladder.join("/")}`,
  };
};
