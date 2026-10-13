/**
 * In-memory Hostaway "test account" behind the typed `hostaway` wrapper
 * (lib/hostaway/api.ts). Reservations persist across calls so the outbox,
 * duplicate and cancelled-upstream rules can be exercised; every call can be
 * scripted to fail with the codes hostawayFetch produces (TIMEOUT, SERVER_ERROR,
 * RATE_LIMITED, CIRCUIT_OPEN, UNAUTHORIZED, ENVELOPE_FAIL, PARSE_FAIL,
 * WRITES_DISABLED).
 */
import type { HostawayCalendarDay, HostawayReservation, HostawayResult } from "@/lib/hostaway/types";

type Failure = Extract<HostawayResult<never>, { ok: false }>;
type Script<T> = Failure | ((...args: never[]) => HostawayResult<T>) | null;

export class FakeHostaway {
  reservations = new Map<number, HostawayReservation & { guestEmail?: string | null; updatedOn?: string | null }>();
  nextId = 5000;
  calls: { method: string; args: unknown[] }[] = [];
  /** Observer for a cross-system timeline (ordering assertions). */
  onCall: ((method: string) => void) | null = null;
  /** Scripted outcome for the next call of each method (consumed once), or `null` for the default. */
  next: {
    createReservation: Script<HostawayReservation>;
    listReservations: Script<HostawayReservation[]>;
    updateReservation: Script<HostawayReservation>;
    getCalendar: Script<HostawayCalendarDay[]>;
    getReservation: Script<HostawayReservation>;
  } = {
    createReservation: null,
    listReservations: null,
    updateReservation: null,
    getCalendar: null,
    getReservation: null,
  };
  /** When true, createReservation reports TIMEOUT but the reservation still lands (§17.3 "outcome unknown"). */
  timeoutButLanded = false;
  /** Dates (YYYY-MM-DD) the calendar reports as unavailable. */
  blockedDates = new Set<string>();

  reset() {
    this.reservations.clear();
    this.nextId = 5000;
    this.calls = [];
    this.next = {
      createReservation: null,
      listReservations: null,
      updateReservation: null,
      getCalendar: null,
      getReservation: null,
    };
    this.timeoutButLanded = false;
    this.blockedDates.clear();
  }

  private take<K extends keyof FakeHostaway["next"]>(k: K): FakeHostaway["next"][K] {
    const s = this.next[k];
    this.next[k] = null;
    return s;
  }

  createReservation = (
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<HostawayResult<HostawayReservation>> => {
    this.onCall?.("createReservation");
    this.calls.push({ method: "createReservation", args: [payload, idempotencyKey] });
    const s = this.take("createReservation");
    if (typeof s === "function")
      return Promise.resolve(
        (s as (p: unknown, k: string) => HostawayResult<HostawayReservation>)(payload, idempotencyKey),
      );
    const land = () => {
      const r = {
        id: this.nextId++,
        listingMapId: payload.listingMapId as number,
        channelId: payload.channelId as number,
        status: "new",
        arrivalDate: payload.arrivalDate as string,
        departureDate: payload.departureDate as string,
        guestName: `${payload.guestFirstName} ${payload.guestLastName}`,
        guestEmail: (payload.guestEmail as string | undefined) ?? null,
        numberOfGuests: payload.numberOfGuests as number,
        totalPrice: payload.totalPrice as number,
        customFieldValues: (payload.customFieldValues as { customFieldId: number; value: string }[] | undefined) ?? [],
        updatedOn: new Date().toISOString(),
      };
      this.reservations.set(r.id, r);
      return r;
    };
    if (s) {
      if (s.code === "TIMEOUT" && this.timeoutButLanded) land();
      return Promise.resolve(s);
    }
    return Promise.resolve({ ok: true, status: 200, data: land() });
  };

  listReservations = (params: {
    listingId?: number;
    arrivalStartDate?: string;
    arrivalEndDate?: string;
  }): Promise<HostawayResult<HostawayReservation[]>> => {
    this.onCall?.("listReservations");
    this.calls.push({ method: "listReservations", args: [params] });
    const s = this.take("listReservations");
    if (typeof s === "function")
      return Promise.resolve((s as (p: unknown) => HostawayResult<HostawayReservation[]>)(params));
    if (s) return Promise.resolve(s);
    const data = [...this.reservations.values()].filter(
      (r) =>
        (!params.listingId || r.listingMapId === params.listingId) &&
        (!params.arrivalStartDate || r.arrivalDate >= params.arrivalStartDate) &&
        (!params.arrivalEndDate || r.arrivalDate <= params.arrivalEndDate),
    );
    return Promise.resolve({ ok: true, status: 200, data: structuredClone(data) });
  };

  updateReservation = (
    rid: number,
    patch: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<HostawayResult<HostawayReservation>> => {
    this.onCall?.("updateReservation");
    this.calls.push({ method: "updateReservation", args: [rid, patch, idempotencyKey] });
    const s = this.take("updateReservation");
    if (typeof s === "function")
      return Promise.resolve((s as (id: number, p: unknown) => HostawayResult<HostawayReservation>)(rid, patch));
    if (s) return Promise.resolve(s);
    const r = this.reservations.get(rid);
    if (!r) return Promise.resolve({ ok: false, status: 404, code: "ENVELOPE_FAIL", message: "Reservation not found" });
    Object.assign(r, patch, { updatedOn: new Date().toISOString() });
    return Promise.resolve({ ok: true, status: 200, data: structuredClone(r) });
  };

  getReservation = (rid: number): Promise<HostawayResult<HostawayReservation>> => {
    this.onCall?.("getReservation");
    this.calls.push({ method: "getReservation", args: [rid] });
    const s = this.take("getReservation");
    if (typeof s === "function")
      return Promise.resolve((s as (id: number) => HostawayResult<HostawayReservation>)(rid));
    if (s) return Promise.resolve(s);
    const r = this.reservations.get(rid);
    if (!r) return Promise.resolve({ ok: false, status: 404, code: "ENVELOPE_FAIL", message: "Reservation not found" });
    return Promise.resolve({ ok: true, status: 200, data: structuredClone(r) });
  };

  getCalendar = (listingId: number, start: string, end: string): Promise<HostawayResult<HostawayCalendarDay[]>> => {
    this.onCall?.("getCalendar");
    this.calls.push({ method: "getCalendar", args: [listingId, start, end] });
    const s = this.take("getCalendar");
    if (typeof s === "function")
      return Promise.resolve(
        (s as (l: number, a: string, b: string) => HostawayResult<HostawayCalendarDay[]>)(listingId, start, end),
      );
    if (s) return Promise.resolve(s);
    const days: HostawayCalendarDay[] = [];
    for (
      let d = new Date(`${start}T00:00:00Z`);
      d.toISOString().slice(0, 10) <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const date = d.toISOString().slice(0, 10);
      const blocked = this.blockedDates.has(date);
      days.push({
        date,
        isAvailable: blocked ? 0 : 1,
        status: blocked ? "blocked" : "available",
        price: 250,
        minimumStay: 1,
        closedOnArrival: 0,
        closedOnDeparture: 0,
      } as unknown as HostawayCalendarDay);
    }
    return Promise.resolve({ ok: true, status: 200, data: days });
  };

  /** Test helper: someone cancels the reservation in the Hostaway UI. */
  cancelUpstream(rid: number) {
    const r = this.reservations.get(rid)!;
    r.status = "cancelled";
    r.updatedOn = new Date().toISOString();
  }
  /** Test helper: a second reservation for the same stay appears (e.g. a retry that bypassed the key). */
  duplicate(rid: number) {
    const r = this.reservations.get(rid)!;
    const dup = { ...structuredClone(r), id: this.nextId++ };
    this.reservations.set(dup.id, dup);
    return dup.id;
  }
}
