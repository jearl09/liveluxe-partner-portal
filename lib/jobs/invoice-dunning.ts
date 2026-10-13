/**
 * invoice-dunning — spec §11.3 invoice.overdue, §17.2 "Invoice unpaid past terms", §21.2.
 * Daily: escalating reminders; at the first threshold the org's new bookings need
 * finance approval; at the second the org is suspended for new bookings. Existing
 * bookings are never touched. The partner admin is warned before each step.
 */
import { runDunning } from "@/lib/payments/dunning";
import type { JobFn } from "./registry";

export const invoiceDunning: JobFn = async ({ requestId }) => runDunning(requestId);
