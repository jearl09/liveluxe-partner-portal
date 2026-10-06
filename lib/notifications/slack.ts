/**
 * Slack notifications (Livluxe only) — spec §12.1.
 * #bookings for new requests / SLA risk; #alerts for sync degradation, payment
 * failures, double-booking detection and anything logged CRITICAL.
 */
import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

type Channel = "bookings" | "alerts";

export async function slack(channel: Channel, text: string, blocks?: unknown[]) {
  const e = env();
  const url = channel === "alerts" ? e.SLACK_ALERTS_WEBHOOK_URL : e.SLACK_WEBHOOK_URL;
  if (!url) {
    log.debug("slack.skipped_no_webhook", { channel, text });
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-type": "application/json" },
    body: JSON.stringify({ text, ...(blocks ? { blocks } : {}) }),
  });
  if (!res.ok) log.warn("slack.post_failed", { channel, status: res.status });
}

export const alertCritical = (condition: string, details?: Record<string, unknown>) => {
  log.critical(condition, details);
  return slack(
    "alerts",
    `:rotating_light: *CRITICAL* ${condition}\n\`\`\`${JSON.stringify(details ?? {}, null, 2)}\`\`\``,
  );
};
