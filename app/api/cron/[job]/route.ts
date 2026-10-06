/**
 * POST/GET /api/cron/{job} — scheduled jobs, spec §21.2.
 * Rejects any request lacking the Vercel cron header *and* the shared secret.
 * Node runtime (never Edge): jobs call Hostaway/Stripe and hold DB locks.
 */
import { env } from "@/lib/env";
import { withApi, ok, fail } from "@/lib/api/response";
import { isJobName } from "@/lib/jobs/registry";
import { runJob } from "@/lib/jobs/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ job: string }> };

const handler = withApi<Ctx>("/api/cron/[job]", async (req, ctx, { requestId }) => {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) return fail("UNAUTHENTICATED", requestId);

  const { job } = await ctx.params;
  if (!isJobName(job)) return fail("NOT_FOUND", requestId, { job });

  const outcome = await runJob(job, requestId);
  return ok({ job, ...outcome }, { requestId });
});

export { handler as GET, handler as POST };
