/** GET /api/health — uptime probe (Better Stack / Checkly). No auth, no secrets, no DB writes. */
import { ok } from "@/lib/api/response";
import { circuitState } from "@/lib/hostaway/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    status: "ok",
    time: new Date().toISOString(),
    hostawayCircuit: circuitState(),
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  });
}
