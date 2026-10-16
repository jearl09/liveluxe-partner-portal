/**
 * Generated database types.
 *
 * REGENERATE after every migration (CI does this on merge to main — spec §4, §21.1):
 *   npm run db:types
 * which runs: supabase gen types typescript --local > lib/db/types.ts
 *
 * This file is a hand-written placeholder with the tables the scaffold touches so
 * the project type-checks before the first `supabase start`. Replace it entirely
 * with generated output; do not maintain it by hand.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type DayStatus = "available" | "blocked" | "reserved" | "pending" | "unknown";

export type BookingStatusDb =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "COUNTER_OFFERED"
  | "APPROVED"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED";

export type DeclineReasonDb =
  | "no_availability"
  | "unsuitable_property"
  | "owner_block"
  | "commercial_terms"
  | "guest_profile"
  | "maintenance"
  | "other";

/** public.booking_requests (§7.2). `nights` and `stay_range` are generated columns. */
export type RateCardRow = {
  id: string;
  org_id: string;
  version: number;
  name: string;
  discount_pct: number;
  fixed_rates: Json;
  los_tiers: Json;
  fee_overrides: Json;
  /** Postgres daterange literal, e.g. "[2026-10-12,2027-01-01)" or "[2026-10-12,)". */
  valid_range: string;
  created_by: string | null;
  created_at: string;
};

export type BookingRequestRow = {
  id: string;
  reference: string;
  org_id: string;
  listing_id: string;
  quote_id: string | null;
  created_by: string;
  on_behalf_of: boolean;
  assigned_to: string | null;
  status: BookingStatusDb;
  check_in: string;
  check_out: string;
  nights: number;
  guests_adults: number;
  guests_children: number;
  guests_pets: number;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  claim_ref: string | null;
  po_number: string | null;
  cost_centre: string | null;
  notes: string | null;
  total_cents: number | null;
  currency: string;
  payment_mode: "prepay" | "deposit" | "net14" | "net30" | null;
  hold_expires_at: string | null;
  decision_due_at: string | null;
  sla_paused_at: string | null;
  sla_escalation_pct: number;
  decline_reason: DeclineReasonDb | null;
  decline_notes: string | null;
  hostaway_reservation_id: number | null;
  hostaway_write_key: string | null;
  hostaway_write_attempted_at: string | null;
  hostaway_written_at: string | null;
  hostaway_write_attempts: number;
  hostaway_last_error: string | null;
  confirm_alerted_at: string | null;
  checkin_released_at: string | null;
  checkin_released_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  confirmed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  cancelled_upstream: boolean;
  cancelled_upstream_at: string | null;
  cancellation_requested_at: string | null;
  cancellation_requested_by: string | null;
  cancellation_reason: string | null;
  cancel_refund_cents: number | null;
  cancel_retained_cents: number | null;
  submission_key: string | null;
  finance_approval_required: boolean;
  finance_approval_reason: string | null;
  refunds_frozen_at: string | null;
  payment_deposit_cents: number | null;
  balance_due_at: string | null;
  balance_paid_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  credentials_purge_at: string | null;
  credentials_purged_at: string | null;
  sla_extended_at: string | null;
  linked_request_id: string | null;
  created_at: string;
  updated_at: string;
};

/** public.booking_modifications — the explicit modification record §6.7 requires before a stay changes length. */
export type BookingModificationRow = {
  id: string;
  booking_id: string;
  kind: "extension" | "early_departure" | "guest_change";
  status: "requested" | "approved" | "declined" | "failed";
  requested_by: string | null;
  decided_by: string | null;
  old_check_in: string;
  old_check_out: string;
  new_check_in: string;
  new_check_out: string;
  delta_cents: number;
  quote_id: string | null;
  reason: string | null;
  decision_note: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  hostaway_status: string | null;
  hostaway_error: string | null;
  alternatives: Json | null;
  requested_at: string;
  decided_at: string | null;
  updated_at: string;
};

/** public.disputes — mirror of a Stripe Dispute plus the evidence pack (§11.2, §17.2). */
export type DisputeRow = {
  id: string;
  booking_id: string | null;
  stripe_dispute_id: string;
  status: string;
  amount_cents: number;
  reason: string | null;
  charge_id: string | null;
  payment_intent_id: string | null;
  evidence: Json | null;
  evidence_built_at: string | null;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

export type ReconciliationRunRow = {
  id: string;
  system: "stripe" | "hostaway";
  period_from: string | null;
  period_to: string | null;
  summary: Json;
  exceptions: number;
  csv: string | null;
  created_at: string;
};

export type ReconciliationExceptionRow = {
  id: string;
  system: "stripe" | "hostaway";
  kind: string;
  entity_type: string;
  entity_id: string;
  external_id: string | null;
  detail: Json | null;
  first_seen_at: string;
  last_seen_at: string;
  alerted_at: string | null;
  resolved_at: string | null;
};

/** public.payments — mirror of one Stripe PaymentIntent (§11.2). Written only by webhook/job code. */
export type PaymentRow = {
  id: string;
  booking_id: string;
  stripe_payment_intent_id: string;
  status: string;
  mode: "authorise" | "charge";
  amount_authorised_cents: number;
  amount_captured_cents: number;
  currency: string;
  method_type: string | null;
  card_brand: string | null;
  card_last4: string | null;
  authorised_at: string | null;
  captured_at: string | null;
  canceled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  kind: "full" | "deposit" | "extension";
  reminder_sent_at: string | null;
  lapsed_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

/** public.invoices — mirror of one Stripe Invoice (§11.5). Stripe hosts the PDF and payment page. */
export type InvoiceRow = {
  id: string;
  booking_id: string | null;
  org_id: string;
  stripe_invoice_id: string;
  number: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  due_at: string | null;
  hosted_url: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  paid_at: string | null;
  kind: "receipt" | "net_terms" | "balance" | "supplementary";
  dunning_stage: number;
  dunning_last_at: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
};

/** public.refunds — mirror of one Stripe Refund (§11.6), plus the credit note issued with it. */
export type RefundRow = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  stripe_refund_id: string;
  amount_cents: number;
  reason: string | null;
  status: string;
  stripe_credit_note_id: string | null;
  failure_reason: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

/** public.listings — Hostaway-synced catalogue (§6.6). geom columns are written as EWKT strings. */
export type ListingRow = {
  id: string;
  hostaway_listing_id: number;
  hostaway_listing_map_id: number | null;
  public_name: string;
  internal_name: string | null;
  description_html: string | null;
  house_rules: string | null;
  address_line: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country_code: string;
  geom: unknown;
  geom_public: unknown;
  timezone: string;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  bed_config: Json | null;
  max_guests: number | null;
  max_pets: number;
  property_type: string | null;
  area_sqm: number | null;
  base_price_cents: number | null;
  currency: string;
  cleaning_fee_cents: number;
  extra_person_fee_cents: number;
  guests_included: number;
  security_deposit_cents: number;
  weekly_discount_pct: number;
  monthly_discount_pct: number;
  min_nights: number;
  max_nights: number | null;
  checkin_from: string | null;
  checkin_to: string | null;
  checkout_by: string | null;
  hostaway_status: string | null;
  is_active: boolean;
  is_partner_visible: boolean;
  suitability_tags: string[];
  partner_notes: string | null;
  min_turnover_hours: number | null;
  checkin_release_offset_hours: number | null;
  content_hash: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

/** public.listing_access_details — SENSITIVE. bytea columns hold AES-GCM blobs as PostgREST `\x…` literals. */
export type ListingAccessDetailsRow = {
  listing_id: string;
  door_code_encrypted: string | null;
  wifi_ssid: string | null;
  wifi_password_encrypted: string | null;
  access_instructions_encrypted: string | null;
  checkin_instructions: string | null;
  special_instructions: string | null;
  parking_notes: string | null;
  emergency_contact: string | null;
  content_hash: string | null;
  updated_at: string;
};

/** public.checkin_access_log — who viewed a released access pack (§8.4). */
export type CheckinAccessLogRow = {
  id: number;
  booking_id: string;
  user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  viewed_at: string;
};

export interface Database {
  public: {
    Tables: {
      audit_log: Row<{
        id: string;
        actor_type: string;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        before: Json | null;
        after: Json | null;
        ip: string | null;
        user_agent: string | null;
        impersonated_by: string | null;
        request_id: string | null;
        occurred_at: string;
      }>;
      webhook_events: Row<{
        id: string;
        source: "stripe" | "hostaway";
        event_type: string;
        external_id: string;
        payload: Json;
        state: "received" | "processing" | "processed" | "failed" | "skipped";
        attempts: number;
        last_error: string | null;
        received_at: string;
        processed_at: string | null;
        next_attempt_at: string | null;
        parked_reason: string | null;
      }>;
      sync_runs: Row<{
        id: string;
        job: string;
        started_at: string;
        finished_at: string | null;
        status: "running" | "succeeded" | "failed" | "skipped";
        records_examined: number;
        records_changed: number;
        api_calls: number;
        error: string | null;
        checkpoint: Json | null;
      }>;
      integration_tokens: Row<{
        provider: string;
        access_token: string;
        issued_at: string;
        expires_at: string;
      }>;
      settings: Row<{
        key: string;
        value: Json;
        description: string | null;
        updated_at: string;
        updated_by: string | null;
      }>;
      partner_orgs: Row<{
        id: string;
        name: string;
        type: "insurance" | "corporate" | "government" | "other";
        status: string;
        stripe_customer_id: string | null;
        logo_url: string | null;
        payment_terms: "prepay" | "deposit" | "net14" | "net30";
        credit_limit_cents: number | null;
        require_po_number: boolean;
        require_claim_ref: boolean;
        sla_hours: number | null;
        quote_validity_hours: number | null;
        default_po_number: string | null;
        default_cost_centre: string | null;
        is_internal: boolean;
        email_domains: string[];
        billing_email: string | null;
        billing_contact_name: string | null;
        abn: string | null;
        deposit_pct: number | null;
        auto_approve_under_cents: number | null;
        hard_holds: boolean;
        credit_standing: "good" | "watch" | "finance_approval" | "suspended";
        credit_standing_changed_at: string | null;
        credit_standing_reason: string | null;
        finance_contact_email: string | null;
        created_at: string;
        updated_at: string;
      }>;
      quotes: Row<{
        id: string;
        listing_id: string;
        org_id: string;
        created_by: string | null;
        check_in: string;
        check_out: string;
        guests_adults: number;
        guests_children: number;
        guests_pets: number;
        line_items: Json;
        subtotal_cents: number;
        tax_cents: number;
        total_cents: number;
        deposit_cents: number;
        currency: string;
        rate_card_id: string | null;
        rate_card_version: number | null;
        price_hash: string;
        expires_at: string;
        supersedes_id: string | null;
        created_at: string;
      }>;
      inventory_holds: Row<{
        id: string;
        listing_id: string;
        booking_id: string | null;
        org_id: string;
        stay_range: string;
        hard: boolean;
        expires_at: string;
        created_at: string;
      }>;
      booking_status_history: Row<{
        id: number;
        booking_id: string;
        from_status: BookingStatusDb | null;
        to_status: BookingStatusDb;
        actor_id: string | null;
        actor_type: "partner" | "livluxe" | "system";
        reason: string | null;
        metadata: Json | null;
        occurred_at: string;
      }>;
      booking_comments: Row<{
        id: string;
        booking_id: string;
        author_id: string;
        body: string;
        visibility: "shared" | "internal";
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      notifications: Row<{
        id: string;
        user_id: string;
        type: string;
        payload: Json;
        read_at: string | null;
        email_sent_at: string | null;
        created_at: string;
      }>;
      partner_users: Row<{
        id: string;
        auth_user_id: string;
        org_id: string;
        role: string;
        email: string;
        full_name: string | null;
        status: "invited" | "active" | "disabled";
        mfa_enrolled: boolean;
        accepted_at: string | null;
        last_seen_at: string | null;
        created_at: string;
      }>;
      rate_cards: Row<RateCardRow>;
      invitations: Row<{
        id: string;
        org_id: string;
        email: string;
        role: string;
        token_hash: string;
        invited_by: string | null;
        expires_at: string;
        accepted_at: string | null;
        created_at: string;
      }>;
      auth_attempts: Row<{ id: number; key: string; attempted_at: string }>;
      job_leases: Row<{ key: string; holder: string; expires_at: string; acquired_at: string }>;
      listings: Row<ListingRow>;
      listing_images: Row<{
        id: string;
        listing_id: string;
        url: string;
        storage_path: string | null;
        caption: string | null;
        sort_order: number;
      }>;
      listing_amenities: Row<{ listing_id: string; amenity_code: string; label: string | null }>;
      listing_access_details: Row<ListingAccessDetailsRow>;
      checkin_access_log: Row<CheckinAccessLogRow>;
      calendar_days: Row<{
        listing_id: string;
        date: string;
        status: DayStatus;
        is_available: boolean;
        allotment: number | null;
        price_cents: number | null;
        min_stay: number | null;
        closed_on_arrival: boolean;
        closed_on_departure: boolean;
        reservation_ref: string | null;
        source_synced_at: string;
      }>;
      booking_requests: Row<BookingRequestRow>;
      payments: Row<PaymentRow>;
      invoices: Row<InvoiceRow>;
      refunds: Row<RefundRow>;
      disputes: Row<DisputeRow>;
      booking_modifications: Row<BookingModificationRow>;
      reconciliation_runs: Row<ReconciliationRunRow>;
      reconciliation_exceptions: Row<ReconciliationExceptionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      job_lease_acquire: { Args: { p_key: string; p_holder: string; p_ttl_seconds: number }; Returns: boolean };
      job_lease_release: { Args: { p_key: string; p_holder: string }; Returns: boolean };
      hostaway_rate_limit_acquire: {
        Args: { p_bucket: string; p_max_tokens: number; p_refill_per_sec: number };
        Returns: boolean;
      };
      map_availability: { Args: { p_from: string; p_to: string }; Returns: unknown[] };
      submit_booking_request: {
        Args: {
          p_listing_id: string;
          p_check_in: string;
          p_check_out: string;
          p_adults: number;
          p_children: number;
          p_pets: number;
          p_line_items: Json;
          p_subtotal_cents: number;
          p_tax_cents: number;
          p_total_cents: number;
          p_deposit_cents: number;
          p_price_hash: string;
          p_rate_card_id: string | null;
          p_rate_card_version: number | null;
          p_guest_name: string;
          p_guest_email: string;
          p_guest_phone: string;
          p_claim_ref: string;
          p_po_number: string;
          p_cost_centre: string;
          p_notes: string;
          p_decision_due_at: string;
          /** Service role only: the signed-in user the request is submitted as. */
          p_auth_user_id?: string;
        };
        Returns: {
          id: string;
          reference: string;
          hold_expires_at: string;
          decision_due_at: string;
          quote_id: string;
        }[];
      };
      apply_booking_transition: {
        Args: {
          p_booking_id: string;
          p_expected_from: BookingStatusDb;
          p_to: BookingStatusDb;
          p_reason?: string | null;
          p_decline_reason?: DeclineReasonDb | null;
          p_metadata?: Json | null;
          p_new_check_in?: string | null;
          p_new_check_out?: string | null;
          p_new_total_cents?: number | null;
          p_new_quote_id?: string | null;
          p_extend_hold_hours?: number | null;
        };
        Returns: BookingRequestRow;
      };
      rate_card_for: { Args: { p_org_id: string; p_date: string }; Returns: RateCardRow[] };
      rate_card_publish: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_discount_pct: number;
          p_los_tiers: Json;
          p_fee_overrides: Json;
          p_fixed_rates: Json;
          p_valid_from: string;
          p_valid_to?: string | null;
        };
        Returns: RateCardRow;
      };
      livluxe_ops_user_ids: { Args: Record<string, never>; Returns: string[] };
      checkin_pack: {
        Args: { p_booking_id: string };
        Returns: {
          property_name: string;
          address_line: string | null;
          suburb: string | null;
          state: string | null;
          postcode: string | null;
          checkin_from: string | null;
          checkin_to: string | null;
          checkout_by: string | null;
          door_code: string | null;
          wifi_ssid: string | null;
          wifi_password: string | null;
          access_instructions: string | null;
          checkin_instructions: string | null;
          special_instructions: string | null;
          parking_notes: string | null;
          emergency_contact: string | null;
          released_at: string;
        }[];
      };
      cancellation_policy: {
        Args: Record<string, never>;
        Returns: { cutoff_days: number; retention_schedule: unknown }[];
      };
      request_policy: {
        Args: Record<string, never>;
        Returns: {
          sla_default_hours: number;
          sla_business_hours: { start: string; end: string; timezone: string };
          hold_duration_hours: number;
          quote_validity_hours: number;
        }[];
      };
      search_available_listings: {
        Args: { p_check_in: string; p_check_out: string; p_guests?: number; p_pets?: number };
        Returns: ListingRow[];
      };
      auth_rate_limit_hit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      invitation_preview: {
        Args: { p_token_hash: string };
        Returns: { email: string; role: string; org_name: string; expires_at: string; accepted_at: string | null }[];
      };
      listing_taken_ranges: {
        Args: { p_listing_id: string; p_from: string; p_to: string; p_except_booking?: string | null };
        Returns: { start_date: string; end_date: string }[];
      };
      availability_freshness: {
        Args: Record<string, never>;
        Returns: { last_synced_at: string | null; stale_after_minutes: number }[];
      };
      accept_invitation: {
        Args: { p_token_hash: string; p_auth_user_id: string; p_full_name: string };
        Returns: string;
      };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
