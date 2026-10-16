/**
 * In-memory stand-in for the Supabase/PostgREST query builder, faithful to the
 * subset the platform uses: from().select/insert/update/upsert/delete with
 * eq/neq/gt/gte/lt/lte/in/is/not/or/ilike/order/limit/range, maybeSingle/single,
 * count+head, and the handful of RPCs the booking flow calls. It also enforces
 * the two guarantees the scenarios depend on: the unique indexes Stripe mirrors
 * rely on (23505) and the no-overlap exclusion constraint (23P01, §7.2.1).
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const UNIQUE: Record<string, string[][]> = {
  webhook_events: [["source", "external_id"]],
  payments: [["stripe_payment_intent_id"]],
  invoices: [["stripe_invoice_id"]],
  refunds: [["stripe_refund_id"]],
  disputes: [["stripe_dispute_id"]],
  booking_requests: [["reference"], ["org_id", "submission_key"]],
  reconciliation_exceptions: [["system", "kind", "entity_type", "entity_id"]],
  settings: [["key"]],
  job_leases: [["key"]],
  partner_orgs: [["id"]],
};
const LIVE = new Set(["APPROVED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN"]);
const SERIAL = new Set(["booking_status_history", "audit_log", "checkin_access_log", "auth_attempts"]);

export class PgError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: string,
  ) {
    super(message);
  }
}

const overlaps = (aIn: string, aOut: string, bIn: string, bOut: string) => aIn < bOut && bIn < aOut;
const nightsOf = (r: Row) =>
  Math.round((Date.parse(`${r.check_out}T00:00:00Z`) - Date.parse(`${r.check_in}T00:00:00Z`)) / 86_400_000);

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function parseOr(expr: string): Filter {
  const parts = expr.split(/,(?=[a-z_]+\.)/);
  const fns = parts.map((p) => {
    const m = /^([a-z_]+)\.(is|eq|neq|lt|lte|gt|gte|ilike|in)\.(.*)$/.exec(p.trim());
    if (!m) throw new Error(`fake db: cannot parse or() clause "${p}"`);
    const [, col, op, raw] = m;
    return mkFilter(col, op, raw === "null" ? null : raw);
  });
  return (row) => fns.some((f) => f(row));
}

function mkFilter(col: string, op: string, value: unknown): Filter {
  switch (op) {
    case "eq":
      return (r) => r[col] === value || String(r[col]) === String(value);
    case "neq":
      return (r) => r[col] !== value && String(r[col]) !== String(value);
    case "gt":
      return (r) => r[col] != null && cmp(r[col], value) > 0;
    case "gte":
      return (r) => r[col] != null && cmp(r[col], value) >= 0;
    case "lt":
      return (r) => r[col] != null && cmp(r[col], value) < 0;
    case "lte":
      return (r) => r[col] != null && cmp(r[col], value) <= 0;
    case "is":
      return (r) => (value === null ? r[col] == null : r[col] === value);
    case "ilike": {
      const re = new RegExp(
        "^" +
          String(value)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*") +
          "$",
        "i",
      );
      return (r) => re.test(String(r[col] ?? ""));
    }
    case "in": {
      const list = Array.isArray(value)
        ? value
        : String(value)
            .replace(/^\(|\)$/g, "")
            .split(",")
            .map((s) => s.trim().replace(/^"|"$/g, ""));
      return (r) => list.some((v) => v === r[col] || String(v) === String(r[col]));
    }
    default:
      throw new Error(`fake db: unsupported operator ${op}`);
  }
}

class Builder implements PromiseLike<{ data: unknown; error: PgError | null; count: number | null }> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim: number | null = null;
  private from_: number | null = null;
  private to_: number | null = null;
  private returning = false;
  private wantCount = false;
  private head = false;
  private payload: Row | Row[] | null = null;
  private onConflict: string[] | null = null;
  private mode: "many" | "maybeSingle" | "single" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = values;
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : ["id"];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "eq", v));
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "neq", v));
    return this;
  }
  gt(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "gt", v));
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "gte", v));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "lt", v));
    return this;
  }
  lte(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "lte", v));
    return this;
  }
  in(col: string, v: unknown[]) {
    this.filters.push(mkFilter(col, "in", v));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push(mkFilter(col, "is", v));
    return this;
  }
  not(col: string, op: string, v: unknown) {
    const f = mkFilter(col, op, v);
    this.filters.push((r) => !f(r));
    return this;
  }
  or(expr: string) {
    this.filters.push(parseOr(expr));
    return this;
  }
  ilike(col: string, v: string) {
    this.filters.push(mkFilter(col, "ilike", v));
    return this;
  }
  contains() {
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((v: { data: unknown; error: PgError | null; count: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(onfulfilled, onrejected);
  }

  private exec(): { data: unknown; error: PgError | null; count: number | null } {
    try {
      const rows = this.db.table(this.table);
      const matching = () => rows.filter((r) => this.filters.every((f) => f(r)));
      let out: Row[];
      switch (this.op) {
        case "select": {
          out = matching();
          for (const o of [...this.orders].reverse())
            out.sort((a, b) => {
              const c = cmp(a[o.col], b[o.col]);
              if ((a[o.col] == null) !== (b[o.col] == null)) {
                const aNull = a[o.col] == null;
                return (o.nullsFirst ? aNull : !aNull) ? -1 : 1;
              }
              return o.asc ? c : -c;
            });
          const count = out.length;
          if (this.from_ != null && this.to_ != null) out = out.slice(this.from_, this.to_ + 1);
          if (this.lim != null) out = out.slice(0, this.lim);
          if (this.head) return { data: null, error: null, count };
          return this.finish(out, count);
        }
        case "insert": {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
          out = list.map((v) => this.db.insertRow(this.table, v));
          return this.finish(out, null);
        }
        case "upsert": {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
          out = list.map((v) => {
            const keys = this.onConflict!;
            const existing = rows.find((r) => keys.every((k) => r[k] === v[k]));
            if (existing) return this.db.updateRow(this.table, existing, v);
            return this.db.insertRow(this.table, v);
          });
          return this.finish(out, null);
        }
        case "update": {
          out = matching().map((r) => this.db.updateRow(this.table, r, this.payload as Row));
          return this.finish(out, null);
        }
        case "delete": {
          out = matching();
          this.db.tables.set(
            this.table,
            rows.filter((r) => !out.includes(r)),
          );
          return this.finish(out, null);
        }
      }
    } catch (e) {
      if (e instanceof PgError) return { data: null, error: e, count: null };
      throw e;
    }
  }

  private finish(out: Row[], count: number | null) {
    const copy = out.map((r) => structuredClone(r));
    if (this.op !== "select" && !this.returning) return { data: null, error: null, count };
    if (this.mode === "maybeSingle") {
      if (copy.length > 1) return { data: null, error: new PgError("PGRST116", "multiple rows"), count };
      return { data: copy[0] ?? null, error: null, count };
    }
    if (this.mode === "single") {
      if (copy.length !== 1)
        return { data: null, error: new PgError("PGRST116", `expected 1 row, got ${copy.length}`), count };
      return { data: copy[0], error: null, count };
    }
    return { data: copy, error: null, count };
  }
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  private serials = new Map<string, number>();
  /** Current signed-in actor for RPCs that read auth.uid(); null = service role / system. */
  actor: { auth_user_id: string } | null = null;
  rpcLog: { name: string; args: Record<string, unknown> }[] = [];

  reset() {
    this.tables.clear();
    this.serials.clear();
    this.rpcLog = [];
    this.actor = null;
  }

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }
  rows<T = Row>(name: string): T[] {
    return this.table(name) as unknown as T[];
  }
  find<T = Row>(name: string, pred: (r: Row) => boolean): T | undefined {
    return this.table(name).find(pred) as T | undefined;
  }
  seed(name: string, rows: Row[]) {
    for (const r of rows) this.insertRow(name, r);
  }

  from(table: string) {
    return new Builder(this, table);
  }

  insertRow(table: string, values: Row): Row {
    const row: Row = { ...values };
    if (SERIAL.has(table)) {
      const n = (this.serials.get(table) ?? 0) + 1;
      this.serials.set(table, n);
      row.id ??= n;
    } else if (table !== "settings" && table !== "job_leases") row.id ??= randomUUID();
    const now = new Date().toISOString();
    if (!["settings", "job_leases"].includes(table)) {
      row.created_at ??= now;
      if (
        [
          "booking_requests",
          "payments",
          "invoices",
          "refunds",
          "partner_orgs",
          "booking_modifications",
          "disputes",
        ].includes(table)
      )
        row.updated_at ??= now;
    }
    if (table === "audit_log") row.occurred_at ??= now;
    if (table === "booking_status_history") row.occurred_at ??= now;
    if (table === "webhook_events") {
      row.state ??= "received";
      row.attempts ??= 0;
      row.received_at ??= now;
      row.next_attempt_at ??= null;
    }
    if (table === "reconciliation_exceptions") {
      row.first_seen_at ??= now;
      row.last_seen_at ??= now;
      row.resolved_at ??= null;
      row.alerted_at ??= null;
    }
    this.defaults(table, row);
    this.checkUnique(table, row, null);
    this.checkExclusion(table, row, null);
    this.table(table).push(row);
    return row;
  }

  updateRow(table: string, existing: Row, patch: Row): Row {
    const next = { ...existing };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) next[k] = v;
    this.defaults(table, next);
    this.checkUnique(table, next, existing);
    this.checkExclusion(table, next, existing);
    Object.assign(existing, next);
    return existing;
  }

  private defaults(table: string, row: Row) {
    if (table === "booking_requests") {
      row.nights = nightsOf(row);
      row.hostaway_write_attempts ??= 0;
      row.finance_approval_required ??= false;
      row.cancelled_upstream ??= false;
      row.sla_escalation_pct ??= 0;
      row.currency ??= "AUD";
      row.guests_adults ??= 1;
      row.guests_children ??= 0;
      row.guests_pets ??= 0;
      for (const k of [
        "quote_id",
        "assigned_to",
        "guest_name",
        "guest_email",
        "guest_phone",
        "claim_ref",
        "po_number",
        "cost_centre",
        "notes",
        "payment_mode",
        "hold_expires_at",
        "decision_due_at",
        "sla_paused_at",
        "decline_reason",
        "decline_notes",
        "hostaway_reservation_id",
        "hostaway_write_key",
        "hostaway_write_attempted_at",
        "hostaway_written_at",
        "hostaway_last_error",
        "confirm_alerted_at",
        "checkin_released_at",
        "submitted_at",
        "approved_at",
        "approved_by",
        "confirmed_at",
        "declined_at",
        "cancelled_at",
        "cancelled_upstream_at",
        "cancellation_requested_at",
        "cancellation_requested_by",
        "cancellation_reason",
        "cancel_refund_cents",
        "cancel_retained_cents",
        "submission_key",
        "finance_approval_reason",
        "refunds_frozen_at",
        "payment_deposit_cents",
        "balance_due_at",
        "balance_paid_at",
        "checked_in_at",
        "completed_at",
        "credentials_purge_at",
        "credentials_purged_at",
        "sla_extended_at",
        "linked_request_id",
      ])
        row[k] ??= null;
    }
    if (table === "payments") {
      row.kind ??= "full";
      row.mode ??= "authorise";
      row.amount_authorised_cents ??= 0;
      row.amount_captured_cents ??= 0;
      for (const k of [
        "reminder_sent_at",
        "lapsed_notified_at",
        "authorised_at",
        "captured_at",
        "canceled_at",
        "failure_code",
        "failure_message",
        "card_brand",
        "card_last4",
        "method_type",
      ])
        row[k] ??= null;
    }
    if (table === "invoices") {
      row.kind ??= "receipt";
      row.dunning_stage ??= 0;
      row.attempt_count ??= 0;
      row.amount_paid_cents ??= 0;
      for (const k of [
        "dunning_last_at",
        "due_at",
        "hosted_url",
        "pdf_url",
        "sent_at",
        "paid_at",
        "number",
        "booking_id",
      ])
        row[k] ??= null;
    }
    if (table === "refunds") {
      row.status ??= "pending";
      for (const k of ["payment_id", "reason", "stripe_credit_note_id", "failure_reason", "approved_by"])
        row[k] ??= null;
    }
    if (table === "partner_orgs") {
      row.credit_standing ??= "good";
      row.status ??= "active";
      row.payment_terms ??= "prepay";
      for (const k of [
        "credit_limit_cents",
        "credit_standing_changed_at",
        "credit_standing_reason",
        "finance_contact_email",
        "stripe_customer_id",
        "abn",
        "billing_email",
        "billing_contact_name",
        "deposit_pct",
        "sla_hours",
      ])
        row[k] ??= null;
    }
    if (table === "booking_modifications") {
      row.status ??= "requested";
      row.delta_cents ??= 0;
      row.requested_at ??= new Date().toISOString();
      for (const k of [
        "decided_by",
        "quote_id",
        "reason",
        "decision_note",
        "invoice_id",
        "payment_id",
        "refund_id",
        "hostaway_status",
        "hostaway_error",
        "alternatives",
        "decided_at",
        "requested_by",
      ])
        row[k] ??= null;
    }
  }

  private checkUnique(table: string, row: Row, except: Row | null) {
    for (const cols of UNIQUE[table] ?? []) {
      if (cols.some((c) => row[c] == null)) continue;
      const clash = this.table(table).find((r) => r !== except && cols.every((c) => r[c] === row[c]));
      if (clash) throw new PgError("23505", `duplicate key value violates unique constraint (${cols.join(",")})`);
    }
  }

  private checkExclusion(table: string, row: Row, except: Row | null) {
    if (table === "booking_requests" && LIVE.has(String(row.status))) {
      const clash = this.table(table).find(
        (r) =>
          r !== except &&
          r.listing_id === row.listing_id &&
          LIVE.has(String(r.status)) &&
          overlaps(String(row.check_in), String(row.check_out), String(r.check_in), String(r.check_out)),
      );
      if (clash) throw new PgError("23P01", "exclusion_violation: no_overlapping_live_bookings");
    }
    if (table === "inventory_holds") {
      const [a, b] = parseRange(String(row.stay_range));
      const clash = this.table(table).find((r) => {
        if (r === except || r.listing_id !== row.listing_id) return false;
        const [c, d] = parseRange(String(r.stay_range));
        return overlaps(a, b, c, d);
      });
      if (clash) throw new PgError("23P01", "exclusion_violation: inventory_holds");
    }
  }

  // ---------------------------------------------------------------------------
  // RPCs
  // ---------------------------------------------------------------------------
  rpc(name: string, args: Record<string, unknown> = {}) {
    this.rpcLog.push({ name, args });
    const run = (): { data: unknown; error: PgError | null } => {
      try {
        return { data: this.callRpc(name, args), error: null };
      } catch (e) {
        if (e instanceof PgError) return { data: null, error: e };
        if (e instanceof Error) return { data: null, error: new PgError("P0001", e.message) };
        throw e;
      }
    };
    const p = Promise.resolve().then(run);
    return Object.assign(p, {
      maybeSingle: () => p.then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })),
      single: () => p.then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data })),
    });
  }

  private callRpc(name: string, a: Record<string, unknown>): unknown {
    switch (name) {
      case "job_lease_acquire":
        return true;
      case "job_lease_release":
        return true;
      case "hostaway_rate_limit_acquire":
        return true;
      case "livluxe_ops_user_ids":
        return this.table("partner_users")
          .filter((u) => String(u.role).startsWith("livluxe_") && u.status === "active")
          .map((u) => u.id);
      case "cancellation_policy": {
        const s = (k: string) => this.table("settings").find((r) => r.key === k)?.value;
        return [
          {
            cutoff_days: Number(s("cancellation.cutoff_days") ?? 14),
            retention_schedule: s("cancellation.retention_schedule") ?? [],
          },
        ];
      }
      case "request_policy": {
        const s = (k: string) => this.table("settings").find((r) => r.key === k)?.value;
        return [
          {
            sla_default_hours: Number(s("sla.default_hours") ?? 4),
            sla_business_hours: s("sla.business_hours") ?? {
              start: "08:00",
              end: "18:00",
              timezone: "Australia/Melbourne",
            },
            hold_duration_hours: Number(s("hold.duration_hours") ?? 48),
            quote_validity_hours: Number(s("quote.validity_hours") ?? 48),
          },
        ];
      }
      case "search_available_listings": {
        const from = String(a.p_check_in);
        const to = String(a.p_check_out);
        return this.table("listings").filter((l) => {
          if (!l.is_active || !l.is_partner_visible) return false;
          if ((l.max_guests as number) < Number(a.p_guests ?? 1)) return false;
          const blocked = this.table("booking_requests").some(
            (b) =>
              b.listing_id === l.id &&
              LIVE.has(String(b.status)) &&
              overlaps(from, to, String(b.check_in), String(b.check_out)),
          );
          return !blocked;
        });
      }
      case "checkin_pack": {
        const b = this.table("booking_requests").find((r) => r.id === a.p_booking_id);
        if (!b) throw new PgError("P0001", "NOT_FOUND");
        if (
          !b.checkin_released_at ||
          b.credentials_purged_at ||
          !["CONFIRMED", "CHECKED_IN"].includes(String(b.status))
        )
          throw new PgError("P0001", "FORBIDDEN");
        const l = this.table("listings").find((r) => r.id === b.listing_id) ?? {};
        const d = this.table("listing_access_details").find((r) => r.listing_id === b.listing_id) ?? {};
        this.insertRow("checkin_access_log", {
          booking_id: b.id,
          user_id: this.actor ? this.userId() : null,
          viewed_at: new Date().toISOString(),
        });
        return [
          {
            property_name: l.public_name,
            address_line: l.address_line ?? null,
            suburb: l.suburb ?? null,
            state: l.state ?? null,
            postcode: l.postcode ?? null,
            checkin_from: l.checkin_from ?? null,
            checkin_to: l.checkin_to ?? null,
            checkout_by: l.checkout_by ?? null,
            door_code: d.door_code ?? null,
            wifi_ssid: d.wifi_ssid ?? null,
            wifi_password: d.wifi_password ?? null,
            access_instructions: d.access_instructions ?? null,
            checkin_instructions: d.checkin_instructions ?? null,
            special_instructions: d.special_instructions ?? null,
            parking_notes: d.parking_notes ?? null,
            emergency_contact: d.emergency_contact ?? null,
            released_at: b.checkin_released_at,
          },
        ];
      }
      case "listing_taken_ranges": {
        // Mirrors …_listing_taken_ranges.sql: live holds and inventory-consuming requests, minus one booking.
        const from = String(a.p_from);
        const to = String(a.p_to);
        const except = (a.p_except_booking as string | null | undefined) ?? null;
        const nowIso = new Date().toISOString();
        const ranges = [
          ...this.table("inventory_holds")
            .filter((h) => h.listing_id === a.p_listing_id && String(h.expires_at) > nowIso && h.booking_id !== except)
            .map((h) => {
              const b = this.table("booking_requests").find((r) => r.id === h.booking_id);
              return b ? { start_date: String(b.check_in), end_date: String(b.check_out) } : null;
            }),
          ...this.table("booking_requests")
            .filter((b) => b.listing_id === a.p_listing_id && LIVE.has(String(b.status)) && b.id !== except)
            .map((b) => ({ start_date: String(b.check_in), end_date: String(b.check_out) })),
        ];
        return ranges.filter(
          (r): r is { start_date: string; end_date: string } => !!r && r.start_date < to && r.end_date > from,
        );
      }
      case "apply_booking_transition":
        return this.applyTransition(a);
      case "submit_booking_request":
        return this.submitBooking(a);
      default:
        throw new Error(`fake db: unknown rpc ${name}`);
    }
  }

  private userId(): string | null {
    if (!this.actor) return null;
    return (this.table("partner_users").find((u) => u.auth_user_id === this.actor!.auth_user_id)?.id as string) ?? null;
  }

  /** Mirrors supabase/migrations …_booking_requests.sql submit_booking_request (the parts the scenarios need). */
  private submitBooking(a: Record<string, unknown>): Row[] {
    // Called by the service role with the acting user passed in (…_tenant_hardening.sql); the session is a fallback.
    const authUserId = (a.p_auth_user_id as string | undefined) ?? this.actor?.auth_user_id;
    const user = authUserId ? this.table("partner_users").find((u) => u.auth_user_id === authUserId) : null;
    if (!user) throw new PgError("P0001", "UNAUTHENTICATED");
    const org = this.table("partner_orgs").find((o) => o.id === user.org_id);
    if (!org || org.status !== "active") throw new PgError("P0001", "ORG_SUSPENDED");
    const listing = this.table("listings").find((l) => l.id === a.p_listing_id && l.is_active && l.is_partner_visible);
    if (!listing) throw new PgError("P0001", "NOT_FOUND");
    const checkIn = String(a.p_check_in);
    const checkOut = String(a.p_check_out);
    if (
      this.table("booking_requests").some(
        (b) =>
          b.listing_id === listing.id &&
          LIVE.has(String(b.status)) &&
          overlaps(checkIn, checkOut, String(b.check_in), String(b.check_out)),
      )
    )
      throw new PgError("P0001", "DATES_UNAVAILABLE");
    const nowMs = Date.now();
    this.tables.set(
      "inventory_holds",
      this.table("inventory_holds").filter(
        (h) => !(h.listing_id === listing.id && Date.parse(String(h.expires_at)) <= nowMs),
      ),
    );
    const holdHours = Number(this.table("settings").find((r) => r.key === "hold.duration_hours")?.value ?? 48);
    const holdUntil = new Date(nowMs + holdHours * 3_600_000).toISOString();
    const quote = this.insertRow("quotes", {
      listing_id: listing.id,
      org_id: user.org_id,
      created_by: user.id,
      check_in: checkIn,
      check_out: checkOut,
      guests_adults: a.p_adults,
      guests_children: a.p_children,
      guests_pets: a.p_pets,
      line_items: a.p_line_items,
      subtotal_cents: a.p_subtotal_cents,
      tax_cents: a.p_tax_cents,
      total_cents: a.p_total_cents,
      deposit_cents: a.p_deposit_cents,
      currency: listing.currency ?? "AUD",
      price_hash: a.p_price_hash,
      expires_at: holdUntil,
    });
    const n = this.table("booking_requests").length + 1;
    const booking = this.insertRow("booking_requests", {
      reference: `LLX-2026-${String(900000 + n).padStart(6, "0")}`,
      org_id: user.org_id,
      listing_id: listing.id,
      quote_id: quote.id,
      created_by: user.id,
      on_behalf_of: String(user.role).startsWith("livluxe_"),
      status: "SUBMITTED",
      check_in: checkIn,
      check_out: checkOut,
      guests_adults: a.p_adults,
      guests_children: a.p_children,
      guests_pets: a.p_pets,
      guest_name: a.p_guest_name || null,
      guest_email: a.p_guest_email || null,
      guest_phone: a.p_guest_phone || null,
      claim_ref: a.p_claim_ref || null,
      po_number: a.p_po_number || null,
      cost_centre: a.p_cost_centre || null,
      notes: a.p_notes || null,
      total_cents: a.p_total_cents,
      currency: listing.currency ?? "AUD",
      payment_mode: org.payment_terms,
      hold_expires_at: holdUntil,
      decision_due_at: a.p_decision_due_at,
      submitted_at: new Date(nowMs).toISOString(),
    });
    try {
      this.insertRow("inventory_holds", {
        listing_id: listing.id,
        booking_id: booking.id,
        org_id: user.org_id,
        stay_range: `[${checkIn},${checkOut})`,
        hard: false,
        expires_at: holdUntil,
      });
    } catch (e) {
      // The SQL function raises inside its transaction, so nothing is kept.
      this.tables.set(
        "booking_requests",
        this.table("booking_requests").filter((b) => b !== booking),
      );
      this.tables.set(
        "quotes",
        this.table("quotes").filter((q) => q !== quote),
      );
      if (e instanceof PgError && e.code === "23P01") throw new PgError("P0001", "DATES_HELD");
      throw e;
    }
    this.insertRow("booking_status_history", {
      booking_id: booking.id,
      from_status: null,
      to_status: "SUBMITTED",
      actor_id: user.id,
      actor_type: "partner",
      reason: "submitted",
    });
    return [
      {
        id: booking.id,
        reference: booking.reference,
        hold_expires_at: holdUntil,
        decision_due_at: a.p_decision_due_at,
        quote_id: quote.id,
      },
    ];
  }

  /** Mirrors supabase/migrations …_cancellations.sql apply_booking_transition. */
  private applyTransition(a: Record<string, unknown>): Row {
    const b = this.table("booking_requests").find((r) => r.id === a.p_booking_id);
    if (!b) throw new PgError("P0001", "NOT_FOUND");
    if (b.status !== a.p_expected_from) throw new PgError("P0001", `INVALID_STATE_TRANSITION:${b.status}`);
    const to = String(a.p_to);
    const user = this.actor
      ? this.table("partner_users").find((u) => u.auth_user_id === this.actor!.auth_user_id)
      : null;
    const actorType = user ? (String(user.role).startsWith("livluxe_") ? "livluxe" : "partner") : "system";
    const now = new Date().toISOString();
    const patch: Row = { status: to };
    if (a.p_new_check_in) patch.check_in = a.p_new_check_in;
    if (a.p_new_check_out) patch.check_out = a.p_new_check_out;
    if (a.p_new_total_cents != null) patch.total_cents = a.p_new_total_cents;
    if (a.p_new_quote_id) patch.quote_id = a.p_new_quote_id;
    if (to === "APPROVED") {
      patch.approved_at = now;
      patch.approved_by = user?.id ?? null;
    }
    if (to === "CONFIRMED") patch.confirmed_at = now;
    if (to === "DECLINED") {
      patch.declined_at = now;
      patch.decline_reason = a.p_decline_reason ?? null;
      patch.decline_notes = a.p_reason ?? null;
    }
    if (to === "CANCELLED") patch.cancelled_at = now;
    if (to === "COUNTER_OFFERED") patch.sla_paused_at = now;
    if (to === "UNDER_REVIEW" && b.status === "COUNTER_OFFERED") patch.sla_paused_at = null;
    if (a.p_extend_hold_hours != null)
      patch.hold_expires_at = new Date(Date.now() + Number(a.p_extend_hold_hours) * 3_600_000).toISOString();
    else if (["DECLINED", "CANCELLED", "EXPIRED", "CONFIRMED"].includes(to)) patch.hold_expires_at = null;
    try {
      this.updateRow("booking_requests", b, patch);
    } catch (e) {
      if (e instanceof PgError && e.code === "23P01") throw new PgError("P0001", "DATES_UNAVAILABLE");
      throw e;
    }
    if (["DECLINED", "CANCELLED", "EXPIRED", "CONFIRMED"].includes(to))
      this.tables.set(
        "inventory_holds",
        this.table("inventory_holds").filter((h) => h.booking_id !== b.id),
      );
    this.insertRow("booking_status_history", {
      booking_id: b.id,
      from_status: a.p_expected_from,
      to_status: to,
      actor_id: user?.id ?? null,
      actor_type: actorType,
      reason: a.p_reason ?? null,
      metadata: a.p_metadata ?? null,
    });
    const notify: Record<string, string> = {
      APPROVED: "request_approved",
      DECLINED: "request_declined",
      COUNTER_OFFERED: "counter_offer",
      EXPIRED: "request_expired",
      CONFIRMED: "request_confirmed",
      CANCELLED: "request_cancelled",
    };
    if (notify[to])
      this.insertRow("notifications", {
        user_id: b.created_by,
        type: notify[to],
        payload: { requestId: b.id, reference: b.reference, actor: user?.full_name ?? "Live Luxe" },
      });
    this.insertRow("audit_log", {
      actor_type: actorType,
      actor_id: user?.id ?? null,
      action: `booking.${to.toLowerCase()}`,
      entity_type: "booking_request",
      entity_id: b.id,
      before: { status: a.p_expected_from },
      after: { status: to, reason: a.p_reason ?? null, metadata: a.p_metadata ?? null },
    });
    return structuredClone(b);
  }
}

function parseRange(s: string): [string, string] {
  const m = /^[[(]([^,]+),([^)\]]+)[)\]]$/.exec(s);
  if (!m) return ["0000-00-00", "0000-00-00"];
  return [m[1], m[2]];
}
