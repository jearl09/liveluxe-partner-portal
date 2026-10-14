/**
 * GET /api/requests/export — the partner's current Requests view as CSV (brief §7.6).
 * Same chip, search and sort as the page; RLS limits it to the caller's organisation.
 */
import { getSessionClaims } from "@/lib/db/server";
import { csvCell, parseBookingSort, parsePartnerGroup } from "@/lib/domain/list-display";
import { STATUS_LABELS } from "@/lib/domain/status";
import { loadPartnerRequests } from "@/lib/requests/partner-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(req: Request) {
  const claims = await getSessionClaims();
  if (!claims) return new Response("Sign in to download requests.", { status: 401 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const group = parsePartnerGroup(sp.group);
  const sort = parseBookingSort(sp.sort, sp.dir);
  const q = (sp.q ?? "").trim().slice(0, 80);

  const header = [
    "Reference",
    "Status",
    "Property",
    "Suburb",
    "Check-in",
    "Check-out",
    "Nights",
    "Guest",
    "Claim reference",
    "PO number",
    "Total",
    "Currency",
    "Last updated (UTC)",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (let page = 1; (page - 1) * 100 < MAX_ROWS; page++) {
    const v = await loadPartnerRequests({ orgId: claims.org_id, group, q, sort, page, pageSize: 100 });
    for (const r of v.rows)
      lines.push(
        [
          r.reference,
          STATUS_LABELS[r.status],
          r.propertyName,
          r.suburb,
          r.checkIn,
          r.checkOut,
          r.nights,
          r.guestName,
          r.claimRef,
          r.poNumber,
          r.totalCents != null ? (r.totalCents / 100).toFixed(2) : "",
          r.currency,
          r.updatedAt,
        ]
          .map(csvCell)
          .join(","),
      );
    if (page >= v.pages) break;
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="live-luxe-requests-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
