/**
 * Role model and permission matrix — spec §2.2 / §2.3.
 *
 * This TypeScript copy mirrors the `role_permissions` table seeded by migration.
 * The database table is the source of truth for RLS and server guards; this
 * module exists so pure domain code and the UI can evaluate permissions from
 * the session without a round-trip. Keep the two in step (a unit test asserts it).
 */

export const USER_ROLES = [
  "partner_admin",
  "partner_booker",
  "partner_viewer",
  "partner_finance",
  "livluxe_ops",
  "livluxe_finance",
  "livluxe_admin",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CAPABILITIES = [
  "listings.view",
  "rates.view_partner",
  "quotes.create",
  "requests.submit",
  "payments.authorise",
  "requests.view_own_org",
  "requests.view_all_orgs",
  "requests.comment",
  "requests.approve",
  "requests.counter",
  "checkin.release",
  "checkin.view_released",
  "requests.cancel",
  "invoices.download",
  "refunds.issue",
  "org.manage_users",
  "rate_cards.manage",
  "partners.manage",
  "audit.view",
  "audit.view_own",
  "support.impersonate",
  "hostaway.resync",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const P = USER_ROLES;
type Row = Partial<Record<UserRole, true>>;
const all = (...roles: UserRole[]): Row => Object.fromEntries(roles.map((r) => [r, true]));

const PARTNER_ADMIN = P[0],
  PARTNER_BOOKER = P[1],
  PARTNER_VIEWER = P[2],
  PARTNER_FINANCE = P[3];
const LL_OPS = P[4],
  LL_FINANCE = P[5],
  LL_ADMIN = P[6];

/** Permission matrix, transcribed from spec §2.3. */
export const PERMISSION_MATRIX: Record<Capability, Row> = {
  "listings.view": all(...P),
  "rates.view_partner": all(...P),
  "quotes.create": all(PARTNER_ADMIN, PARTNER_BOOKER, LL_OPS, LL_FINANCE, LL_ADMIN),
  "requests.submit": all(PARTNER_ADMIN, PARTNER_BOOKER, LL_OPS, LL_FINANCE, LL_ADMIN), // livluxe = on behalf of
  "payments.authorise": all(PARTNER_ADMIN, PARTNER_BOOKER, LL_FINANCE, LL_ADMIN),
  "requests.view_own_org": all(...P),
  "requests.view_all_orgs": all(LL_OPS, LL_FINANCE, LL_ADMIN),
  "requests.comment": all(PARTNER_ADMIN, PARTNER_BOOKER, LL_OPS, LL_FINANCE, LL_ADMIN),
  "requests.approve": all(LL_OPS, LL_FINANCE, LL_ADMIN), // ops subject to value ceiling
  "requests.counter": all(LL_OPS, LL_FINANCE, LL_ADMIN),
  "checkin.release": all(LL_OPS, LL_FINANCE, LL_ADMIN),
  "checkin.view_released": all(PARTNER_ADMIN, PARTNER_BOOKER, PARTNER_VIEWER, LL_OPS, LL_FINANCE, LL_ADMIN),
  "requests.cancel": all(PARTNER_ADMIN, PARTNER_BOOKER, LL_OPS, LL_FINANCE, LL_ADMIN), // partner: before cut-off only
  "invoices.download": all(PARTNER_ADMIN, PARTNER_BOOKER, PARTNER_FINANCE, LL_OPS, LL_FINANCE, LL_ADMIN),
  "refunds.issue": all(LL_FINANCE, LL_ADMIN),
  "org.manage_users": all(PARTNER_ADMIN, LL_ADMIN),
  "rate_cards.manage": all(LL_FINANCE, LL_ADMIN),
  "partners.manage": all(LL_ADMIN),
  "audit.view": all(LL_FINANCE, LL_ADMIN),
  "audit.view_own": all(LL_OPS, LL_FINANCE, LL_ADMIN),
  "support.impersonate": all(LL_ADMIN),
  "hostaway.resync": all(LL_OPS, LL_FINANCE, LL_ADMIN),
};

export function can(role: UserRole, capability: Capability): boolean {
  return PERMISSION_MATRIX[capability][role] === true;
}

export function isLivluxeRole(role: UserRole): boolean {
  return role.startsWith("livluxe_");
}

export function isPartnerRole(role: UserRole): boolean {
  return role.startsWith("partner_");
}

/** Custom claims in the Supabase JWT (spec §8.3). On the wire the role claim is `user_role`; `role` is reserved by Supabase. */
export interface SessionClaims {
  sub: string;
  org_id: string;
  role: UserRole;
  email?: string;
}
