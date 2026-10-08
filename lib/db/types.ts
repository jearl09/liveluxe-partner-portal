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
        status: string;
        stripe_customer_id: string | null;
        logo_url: string | null;
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
      }>;
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
      booking_requests: Row<{
        id: string;
        reference: string;
        org_id: string;
        listing_id: string;
        status: string;
        check_in: string;
        check_out: string;
        nights: number;
        guest_name: string | null;
        claim_ref: string | null;
        po_number: string | null;
        total_cents: number | null;
        currency: string;
        hold_expires_at: string | null;
        decision_due_at: string | null;
        checkin_released_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      try_advisory_lock: { Args: { lock_key: string }; Returns: boolean };
      release_advisory_lock: { Args: { lock_key: string }; Returns: boolean };
      hostaway_rate_limit_acquire: {
        Args: { p_bucket: string; p_max_tokens: number; p_refill_per_sec: number };
        Returns: boolean;
      };
      map_availability: { Args: { p_from: string; p_to: string }; Returns: unknown[] };
      search_available_listings: {
        Args: { p_check_in: string; p_check_out: string; p_guests?: number; p_pets?: number };
        Returns: ListingRow[];
      };
      auth_rate_limit_hit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      invitation_preview: {
        Args: { p_token_hash: string };
        Returns: { email: string; role: string; org_name: string; expires_at: string; accepted_at: string | null }[];
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
