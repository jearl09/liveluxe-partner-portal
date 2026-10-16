#!/usr/bin/env node
/**
 * Recreate the demo partner on the TEST environment and send the real invite email (docs/demo/DEMO_SCRIPT.md).
 * Run scripts/demo-reset.mjs --yes first; this refuses if the demo organisation already exists.
 *
 *   node scripts/demo-setup.mjs --admin-email <partner admin> [--ops-email <Live Luxe admin>] [--domains a.com,b.com]
 *                               [--app-url https://…]
 *
 * Creates "Demo Insurance Co" (Insurance): card held at request (prepay), AUD 5,000 credit limit, the configured
 * decision deadline, claim reference required, PO optional, invite domains as given; a 10% rate card effective
 * today; and an invitation for the partner administrator, emailed from EMAIL_FROM with the portal's own template
 * and token rules (lib/auth/tokens.ts, lib/notifications/templates/invitation.tsx). No account is created directly
 * and no password is set or printed: people join through the emailed link.
 *
 * The Live Luxe admin (--ops-email, already an account) keeps their account; abandoned, never-verified two-factor
 * set-ups on it are cleared so turning two-factor on starts with a fresh QR code. Their password is set by them through
 * "Forgotten your password?" on the site, never here.
 *
 * Finally prints the three demo properties and their free date ranges, read live from the synced calendar.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createJiti } from "jiti";
import { Resend } from "resend";
import { DEMO_ORG_NAME, loadTestEnv, must } from "./demo/env.mjs";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const adminEmail = arg("admin-email")?.trim().toLowerCase();
const opsEmail = arg("ops-email", "claudia@liveluxeau.com").trim().toLowerCase();
const domains = arg("domains", "gmail.com,liveluxeau.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const appUrl = arg("app-url", "https://liveluxe-partner-portal.vercel.app").replace(/\/$/, "");
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  console.error("Usage: node scripts/demo-setup.mjs --admin-email <partner admin email> [--ops-email …] [--domains …]");
  process.exit(1);
}
if (!domains.includes(adminEmail.split("@")[1])) domains.push(adminEmail.split("@")[1]);

/** The demo properties (single apartments, three buildings, real prices, photos that load; chosen 17 Oct 2026). */
const DEMO_LISTINGS = [
  { id: "18efae07-2b20-44f1-ad1c-b2801baf0c48", use: "Request 1: approve (30 nights)" },
  { id: "f065ecd5-5d52-42b8-983c-fac617d6eb39", use: "Request 2: counter-offer" },
  { id: "563b7155-0b60-4352-9c0b-377148d915ce", use: "Request 3: decline" },
];

const { db, env } = loadTestEnv();
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, alias: { "@": root } });
const melbourneToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());

// --- 0. Preconditions ------------------------------------------------------------------------------------------------
const existing = must(
  "check demo org",
  await db.from("partner_orgs").select("id").eq("name", DEMO_ORG_NAME).eq("is_internal", false),
);
if (existing.length) {
  console.error(`"${DEMO_ORG_NAME}" already exists. Run node scripts/demo-reset.mjs --yes first.`);
  process.exit(1);
}
const ops = must(
  "find Live Luxe admin",
  await db
    .from("partner_users")
    .select("id, auth_user_id, full_name, email, role, status, partner_orgs!inner(is_internal)")
    .eq("email", opsEmail)
    .maybeSingle(),
);
if (!ops || !ops.partner_orgs.is_internal || ops.role !== "livluxe_admin" || ops.status !== "active") {
  console.error(`${opsEmail} is not an active Live Luxe administrator on this environment.`);
  process.exit(1);
}

// --- 1. Live Luxe admin: clear never-verified two-factor set-ups (an active one is left alone) ----------------------
const { data: authUser, error: authErr } = await db.auth.admin.getUserById(ops.auth_user_id);
if (authErr) throw new Error(`read admin sign-in account: ${authErr.message}`);
const unverified = (authUser.user.factors ?? []).filter((f) => f.status === "unverified");
for (const f of unverified) {
  const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: ops.auth_user_id });
  if (error) console.warn(`  could not clear an unverified two-factor set-up: ${error.message}`);
}
const verified = (authUser.user.factors ?? []).filter((f) => f.status === "verified").length;
console.log(
  `Live Luxe admin ${opsEmail}: ${verified ? "two-factor already active (sign-in asks for a code)" : "no two-factor yet (optional for staff: Settings → Two-factor authentication → Turn on)"}` +
    (unverified.length ? `; cleared ${unverified.length} abandoned set-up(s)` : ""),
);

// --- 2. The organisation --------------------------------------------------------------------------------------------
const org = must(
  "create organisation",
  await db
    .from("partner_orgs")
    .insert({
      name: DEMO_ORG_NAME,
      type: "insurance",
      status: "active",
      payment_terms: "prepay", // card held at request, charged on approval
      credit_limit_cents: 500_000,
      require_claim_ref: true,
      require_po_number: false,
      email_domains: domains,
      billing_email: adminEmail,
      finance_contact_email: adminEmail,
      sla_hours: null, // the configured decision deadline (settings)
    })
    .select("id")
    .single(),
);
console.log(`Organisation: ${DEMO_ORG_NAME} (Insurance) ${org.id}; invites accepted from ${domains.join(", ")}`);

// --- 3. Rate card: 10% off, effective today, no end date ------------------------------------------------------------
must(
  "create rate card",
  await db.from("rate_cards").insert({
    org_id: org.id,
    version: 1,
    name: "Demo partner rate: 10% off",
    discount_pct: 10,
    valid_range: `[${melbourneToday},)`,
    created_by: ops.id,
  }),
);
console.log(`Rate card: 10% off from ${melbourneToday}`);

// --- 4. The invitation, exactly as the portal sends it ---------------------------------------------------------------
const { generateToken, hashToken } = await jiti.import(join(root, "lib/auth/tokens.ts"));
const { default: Invitation } = await jiti.import(join(root, "lib/notifications/templates/invitation.tsx"));
const token = generateToken();
if (hashToken(token) !== createHash("sha256").update(token, "utf8").digest("hex"))
  throw new Error("token hashing changed");
const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const inv = must(
  "create invitation",
  await db
    .from("invitations")
    .insert({
      org_id: org.id,
      email: adminEmail,
      role: "partner_admin",
      token_hash: hashToken(token),
      invited_by: ops.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single(),
);
const template = Invitation({
  orgName: DEMO_ORG_NAME,
  role: "partner_admin",
  inviteUrl: `${appUrl}/invite/${token}`,
  invitedBy: ops.full_name ?? ops.email,
  expiresLabel:
    expiresAt.toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" }) +
    " AEST/AEDT",
  supportEmail: env.EMAIL_REPLY_TO,
});
const { data: sent, error: sendErr } = await new Resend(env.RESEND_API_KEY).emails.send(
  {
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    to: adminEmail,
    subject: `You're invited to the Livluxe partner portal — ${DEMO_ORG_NAME}`,
    html: await render(template),
    text: await render(template, { plainText: true }),
    tags: [{ name: "template", value: "invitation" }],
  },
  { idempotencyKey: `invitation:${inv.id}` },
);
if (sendErr) {
  console.error(
    `Invitation created but the email failed: ${sendErr.message}. Revoke it on the Partners page and re-send.`,
  );
  process.exit(1);
}
must(
  "audit",
  await db.from("audit_log").insert({
    actor_type: "livluxe",
    actor_id: ops.id,
    action: "auth.invitation_sent",
    entity_type: "invitations",
    entity_id: inv.id,
    after: {
      email: adminEmail,
      role: "partner_admin",
      orgId: org.id,
      expiresAt: expiresAt.toISOString(),
      emailed: true,
      via: "scripts/demo-setup.mjs",
    },
  }),
);
console.log(
  `Invitation: partner administrator ${adminEmail}, emailed from ${env.EMAIL_FROM} (Resend id ${sent?.id}); link valid 7 days`,
);

// --- 5. Demo properties and their free dates --------------------------------------------------------------------------
console.log("\nDemo properties (free = open, priced nights; a stay may end on the first booked day):");
const until = new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10);
const { partnerPropertyName } = await jiti.import(join(root, "lib/domain/property-name.ts"));
for (const d of DEMO_LISTINGS) {
  const l = must(
    "listing",
    await db
      .from("listings")
      .select("id, public_name, internal_name, suburb, bedrooms, max_guests, is_active, is_partner_visible")
      .eq("id", d.id)
      .single(),
  );
  const days = must(
    "calendar",
    await db
      .from("calendar_days")
      .select("date, is_available, status, allotment, price_cents")
      .eq("listing_id", d.id)
      .gte("date", melbourneToday)
      .lte("date", until)
      .order("date"),
  );
  const open = (x) =>
    (x.allotment != null ? x.allotment > 0 : x.is_available && x.status === "available") &&
    x.price_cents != null &&
    x.price_cents !== 200_000;
  const runs = [];
  for (const x of days) {
    const last = runs.at(-1);
    if (open(x)) {
      if (last && last.next === x.date) Object.assign(last, { end: x.date, n: last.n + 1, next: nextDay(x.date) });
      else runs.push({ start: x.date, end: x.date, n: 1, next: nextDay(x.date) });
    }
  }
  const visible = l.is_active && l.is_partner_visible ? "" : "  ⚠ not partner-visible";
  console.log(
    `  ${d.use}: ${partnerPropertyName(l.public_name, l.internal_name)}, ${l.suburb} · ${l.bedrooms} bed · sleeps ${l.max_guests}${visible}`,
  );
  console.log(`    ${appUrl}/listings/${l.id}`);
  console.log(
    `    free: ${
      runs
        .filter((r) => r.n >= 3)
        .map((r) => `${r.start} → ${r.next} (${r.n} nights)`)
        .join("; ") || "none in the next 75 days"
    }`,
  );
}
console.log("\nNext: docs/demo/DEMO_SCRIPT.md, Before you start.");

function nextDay(iso) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
