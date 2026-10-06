/**
 * Transactional email via Resend + React Email — spec §12.1, Appendix D.
 * Templates are versioned React components in ./templates. Transactional mail has
 * no unsubscribe; every partner-facing template carries the booking reference in
 * subject and body, one primary action and a human contact.
 */
import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

let resend: Resend | undefined;
function client() {
  return (resend ??= new Resend(env().RESEND_API_KEY));
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  template: ReactElement;
  /** Used as the Resend idempotency key so a retried job never double-sends. */
  idempotencyKey: string;
  tags?: Record<string, string>;
}

export async function sendEmail(args: SendEmailArgs) {
  const e = env();
  const html = await render(args.template);
  const text = await render(args.template, { plainText: true });
  const { data, error } = await client().emails.send(
    {
      from: e.EMAIL_FROM,
      replyTo: e.EMAIL_REPLY_TO,
      to: args.to,
      subject: args.subject,
      html,
      text,
      tags: Object.entries(args.tags ?? {}).map(([name, value]) => ({ name, value })),
    },
    { idempotencyKey: args.idempotencyKey },
  );
  if (error) {
    log.error("email.send_failed", { subject: args.subject, error: error.message });
    throw new Error(`email send failed: ${error.message}`);
  }
  log.info("email.sent", { id: data?.id, subject: args.subject });
  return data;
}
