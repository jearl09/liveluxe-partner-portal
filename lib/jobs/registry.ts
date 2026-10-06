/**
 * Scheduled job registry — spec §21.2.
 * Schedules live in vercel.json; each job is invoked at /api/cron/{name}.
 * Every job: authenticated by CRON_SECRET, guarded by an advisory lock, records a
 * sync_runs row, emits a heartbeat, and is safe to run twice.
 */
import { log } from "@/lib/observability/logger";

export interface JobResult {
  examined?: number;
  changed?: number;
  apiCalls?: number;
  notes?: string;
  /** Resumable cursor for chunked jobs (§17.5 "serverless timeout on bulk sync"). */
  checkpoint?: unknown;
}

export type JobFn = (ctx: { requestId: string }) => Promise<JobResult>;

const todo =
  (name: string): JobFn =>
  async () => {
    log.info("job.todo", { job: name });
    return { notes: "not implemented" };
  };

export const JOBS: Record<string, { schedule: string; description: string; run: JobFn; critical?: boolean }> = {
  "sync-listings": {
    schedule: "0 * * * *",
    description: "Full catalogue refresh from Hostaway (hash-compare upsert, soft-delete absent).",
    run: todo("sync-listings"),
  },
  "sync-calendar-near": {
    schedule: "*/15 * * * *",
    description: "Calendar 0–120 days, staggered by listing_id % 15.",
    run: todo("sync-calendar-near"),
  },
  "sync-calendar-far": {
    schedule: "0 */6 * * *",
    description: "Calendar 121–400 days.",
    run: todo("sync-calendar-far"),
  },
  "drain-webhooks": {
    schedule: "* * * * *",
    description: "Process queued webhook_events with FOR UPDATE SKIP LOCKED.",
    run: todo("drain-webhooks"),
  },
  "expire-holds": {
    schedule: "*/5 * * * *",
    description: "Release expired holds; cancel associated PaymentIntents.",
    run: todo("expire-holds"),
    critical: true,
  },
  "sla-escalation": {
    schedule: "*/10 * * * *",
    description: "Escalation ladder at 50/80/100/150% of SLA.",
    run: todo("sla-escalation"),
  },
  "release-checkin": {
    schedule: "0 * * * *",
    description: "Release access packs at T-48h (configurable).",
    run: todo("release-checkin"),
  },
  "reconcile-hostaway": {
    schedule: "15 3 * * *",
    description: "Full drift comparison; CRITICAL on confirmed booking without live reservation.",
    run: todo("reconcile-hostaway"),
  },
  "reconcile-stripe": {
    schedule: "45 3 * * *",
    description: "Financial reconciliation; HIGH on unmatched > 24h.",
    run: todo("reconcile-stripe"),
  },
  "check-authorisations": {
    schedule: "0 9 * * *",
    description: "Flag uncaptured authorisations older than 5 days.",
    run: todo("check-authorisations"),
  },
  "invoice-dunning": {
    schedule: "0 10 * * *",
    description: "Overdue reminders and escalation.",
    run: todo("invoice-dunning"),
  },
  "complete-stays": {
    schedule: "30 4 * * *",
    description: "Transition past-departure bookings; schedule credential purge.",
    run: todo("complete-stays"),
  },
  "token-health": {
    schedule: "0 8 * * *",
    description: "Hostaway token expiry warnings at 60/30/7 days.",
    run: todo("token-health"),
  },
  digests: { schedule: "0 7 * * *", description: "Daily ops digest; weekly partner digest.", run: todo("digests") },
};

export type JobName = keyof typeof JOBS;
export const isJobName = (s: string): s is JobName => Object.prototype.hasOwnProperty.call(JOBS, s);
