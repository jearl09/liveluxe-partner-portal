/**
 * Job runner: lock → sync_runs row → run → heartbeat. Spec §21.2, §17.5.
 */
import { adminDb } from "@/lib/db/admin";
import { withAdvisoryLock } from "./lock";
import { JOBS, type JobName } from "./registry";
import { log } from "@/lib/observability/logger";
import { alertCritical } from "@/lib/notifications/slack";

/** Longer than the route's maxDuration (300 s) plus the lease TTL, so a live run is never closed. */
const STALE_RUN_MS = 10 * 60_000;

export type RunOutcome = { status: "succeeded" | "failed" | "skipped"; runId?: string; error?: string };

export async function runJob(name: JobName, requestId: string): Promise<RunOutcome> {
  const job = JOBS[name];
  const db = adminDb();

  return withAdvisoryLock<RunOutcome>(
    `job:${name}`,
    async () => {
      // A serverless invocation can die without reaching the catch below (timeout, OOM,
      // dev-server restart). Its lease has already expired or we would not be here, so
      // close any row it left behind rather than show "running" forever (§17.5).
      const stale = await db
        .from("sync_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error: "abandoned: invocation died" })
        .eq("job", name)
        .eq("status", "running")
        .lt("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString())
        .select("id");
      if (stale.data?.length) log.warn("job.stale_runs_closed", { job: name, count: stale.data.length });

      const { data: run, error } = await db
        .from("sync_runs")
        .insert({ job: name, status: "running", started_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error || !run) throw new Error(`sync_runs insert failed: ${error?.message}`);

      const started = Date.now();
      try {
        const result = await job.run({ requestId });
        await db
          .from("sync_runs")
          .update({
            status: "succeeded",
            finished_at: new Date().toISOString(),
            records_examined: result.examined ?? 0,
            records_changed: result.changed ?? 0,
            api_calls: result.apiCalls ?? 0,
            checkpoint: (result.checkpoint ?? null) as never,
          })
          .eq("id", run.id);
        log.info("job.succeeded", { job: name, requestId, durationMs: Date.now() - started, ...result });
        return { status: "succeeded", runId: run.id };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await db
          .from("sync_runs")
          .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
          .eq("id", run.id);
        log.error("job.failed", { job: name, requestId, durationMs: Date.now() - started, error: message });
        if (job.critical) await alertCritical(`Critical job failed: ${name}`, { runId: run.id, error: message });
        return { status: "failed", runId: run.id, error: message };
      }
    },
    {
      onLocked: async () => {
        await db.from("sync_runs").insert({
          job: name,
          status: "skipped",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          error: "lock held by another invocation",
        });
        log.info("job.skipped_locked", { job: name, requestId });
        return { status: "skipped" };
      },
    },
  );
}
