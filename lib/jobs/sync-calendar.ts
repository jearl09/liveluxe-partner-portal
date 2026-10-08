/**
 * sync-calendar-near / sync-calendar-far — availability and nightly rates (spec §6.4.1).
 *
 * Near: today → +120 days, every 15 minutes. Far: +121 → +400 days, every 6 hours.
 * Each run walks the active listings in id order from the last checkpoint, within a
 * time budget, and stores a cursor so the next run continues where this one stopped.
 * One listing's failure is logged and skipped; the run only fails if nothing succeeded.
 */
import { adminDb } from "@/lib/db/admin";
import { hostaway } from "@/lib/hostaway/api";
import { mapCalendarDay } from "@/lib/hostaway/mappers";
import { chunk, nextCalendarBatch } from "@/lib/domain/sync";
import { calendarWindow, todayIn, type CALENDAR_WINDOWS } from "@/lib/domain/dates";
import { log } from "@/lib/observability/logger";
import type { JobFn } from "./registry";

const TZ = "Australia/Melbourne";
const BATCH_LISTINGS = 60; // ≈ 75 s at the bulk budget of 8 calls / 10 s
const TIME_BUDGET_MS = 200_000; // under the 300 s route maxDuration
const UPSERT_BATCH = 500;

interface Checkpoint {
  cursor: number | null;
}

export function syncCalendar(kind: keyof typeof CALENDAR_WINDOWS, jobName: string): JobFn {
  return async ({ requestId }) => {
    const db = adminDb();
    const started = Date.now();
    const today = todayIn(TZ);
    const window = calendarWindow(kind, today);

    const { data: listings, error } = await db
      .from("listings")
      .select("id, hostaway_listing_id")
      .eq("is_active", true)
      .order("hostaway_listing_id", { ascending: true })
      .range(0, 4999);
    if (error) throw new Error(`listings read failed: ${error.message}`);
    if (!listings?.length)
      return { examined: 0, changed: 0, apiCalls: 0, notes: "no active listings — run sync-listings first" };

    const { data: lastRun } = await db
      .from("sync_runs")
      .select("checkpoint")
      .eq("job", jobName)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previous = (lastRun?.checkpoint ?? null) as Checkpoint | null;

    const ordered = listings.map((l) => l.hostaway_listing_id);
    const batch = nextCalendarBatch(ordered, previous?.cursor ?? null, BATCH_LISTINGS);
    const uuidByHostaway = new Map(listings.map((l) => [l.hostaway_listing_id, l.id]));

    let apiCalls = 0;
    let daysWritten = 0;
    let listingsDone = 0;
    let failures = 0;
    let lastProcessed: number | null = previous?.cursor ?? null;
    let stoppedEarly = false;

    for (const hostawayId of batch.ids) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        stoppedEarly = true;
        break;
      }
      const res = await hostaway.getCalendar(hostawayId, window.from, window.to);
      apiCalls++;
      if (!res.ok) {
        failures++;
        log.error("sync.calendar.listing_failed", {
          requestId,
          job: jobName,
          hostawayId,
          code: res.code,
          message: res.message,
        });
        if (res.code === "CIRCUIT_OPEN" || res.code === "UNAUTHORIZED") {
          stoppedEarly = true;
          break;
        }
        lastProcessed = hostawayId;
        continue;
      }

      const listingId = uuidByHostaway.get(hostawayId)!;
      const syncedAt = new Date().toISOString();
      const rows = res.data
        .filter((d) => d.date >= window.from && d.date <= window.to)
        .map((d) => {
          const m = mapCalendarDay(d);
          return {
            listing_id: listingId,
            date: m.date,
            status: m.status,
            is_available: m.isAvailable,
            allotment: m.allotment,
            price_cents: m.priceCents,
            min_stay: m.minStay,
            closed_on_arrival: m.closedOnArrival,
            closed_on_departure: m.closedOnDeparture,
            reservation_ref: m.reservationRef,
            source_synced_at: syncedAt,
          };
        });

      for (const part of chunk(rows, UPSERT_BATCH)) {
        const { error: upErr } = await db.from("calendar_days").upsert(part, { onConflict: "listing_id,date" });
        if (upErr) throw new Error(`calendar_days upsert failed: ${upErr.message}`);
      }
      daysWritten += rows.length;
      listingsDone++;
      lastProcessed = hostawayId;
    }

    if (listingsDone === 0 && failures > 0) {
      throw new Error(`calendar sync: all ${failures} listings in this batch failed`);
    }

    // Resume from the last listing we actually handled; a finished pass restarts from the top.
    const cursor: number | null = stoppedEarly ? lastProcessed : batch.nextCursor;
    const checkpoint: Checkpoint = { cursor };

    return {
      examined: batch.ids.length,
      changed: daysWritten,
      apiCalls,
      checkpoint,
      notes: `window=${window.from}..${window.to} listings=${listingsDone}/${ordered.length} failed=${failures} ${
        cursor === null ? "pass complete" : `resume after ${cursor}`
      }`,
    };
  };
}
