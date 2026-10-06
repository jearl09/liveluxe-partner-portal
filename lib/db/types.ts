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
      listings: Row<{
        id: string;
        hostaway_listing_id: number;
        public_name: string;
        suburb: string | null;
        is_active: boolean;
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
