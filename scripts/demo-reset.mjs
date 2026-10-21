#!/usr/bin/env node
/**
 * Remove the demo partner's data from the TEST environment, so both dashboards start empty.
 *
 *   node scripts/demo-reset.mjs          # dry run: lists what would be removed, changes nothing
 *   node scripts/demo-reset.mjs --yes    # removes it
 *   node scripts/demo-reset.mjs --yes --include-request LLX-2026-000003
 *                                        # also removes a named test request Live Luxe staff made for the internal
 *                                        # organisation (never another partner's, never the organisation itself)
 *   node scripts/demo-reset.mjs --org "NRMA Insurance" [--yes]
 *                                        # also removes a named test partner organisation (repeatable; the internal
 *                                        # Live Luxe organisation is never matched)
 *   node scripts/demo-reset.mjs --env-file .env.live --project <ref> [--yes]
 *                                        # same removal on the one named project (the live site before real
 *                                        # partners exist); refused unless that file points at that project, with a
 *                                        # Stripe test key and Hostaway writes off (scripts/demo/env.mjs)
 *
 * The demo then creates the organisation and its people live, from the ops console (docs/demo/DEMO_SCRIPT.md).
 *
 * Scope: the partner organisations named in DEMO_ORG_NAMES (scripts/demo/env.mjs: "Demo Insurance Co" and the
 * throwaway "iinsurance de"; never the internal Live Luxe organisation or its staff) and what hangs off them: requests, quotes, holds, payments, invoices, refunds, disputes, modifications, comments, documents,
 * check-in access log, notifications, invitations, rate cards, saved searches, its users (portal and sign-in
 * accounts), the audit rows about any of those, and its Stripe test-mode objects (open card holds cancelled, open
 * invoices voided, drafts and the customer deleted). Nothing that belongs to another organisation is touched, and
 * the audit history of everything else stays as it is. Synced listings, calendars and other partners' rate cards
 * are never read for writing.
 *
 * Refuses to run unless .env.local points at the TEST Supabase project with a Stripe test key and Hostaway writes
 * off (scripts/demo/env.mjs). Re-runnable: a second run finds nothing and says so.
 */
import { DEMO_ORG_NAMES, loadTestEnv, must } from "./demo/env.mjs";

const apply = process.argv.includes("--yes");
const extraRefs = process.argv.flatMap((a, i, all) => (a === "--include-request" && all[i + 1] ? [all[i + 1]] : []));
const extraOrgs = process.argv.flatMap((a, i, all) => (a === "--org" && all[i + 1] ? [all[i + 1].trim()] : []));
const orgNames = [...new Set([...DEMO_ORG_NAMES, ...extraOrgs.filter(Boolean)])];
const { db, stripe } = loadTestEnv();

const ids = (rows, key = "id") => [...new Set((rows ?? []).map((r) => r[key]).filter(Boolean))];
const inList = (xs) => (xs.length ? xs : ["00000000-0000-0000-0000-000000000000"]);

// --- What is demo data ---------------------------------------------------------------------------------------------
const orgs = must(
  "find demo organisation",
  await db
    .from("partner_orgs")
    .select("id, name, stripe_customer_id, is_internal")
    .in("name", orgNames)
    .eq("is_internal", false),
);
for (const name of extraOrgs) if (!orgs.some((o) => o.name === name)) console.warn(`  --org "${name}": not found, skipped`);
if (!orgs.length && !extraRefs.length) {
  console.log(`No demo organisation (${orgNames.join(", ")}) found: nothing to remove.`);
  await reportNumbering();
  process.exit(0);
}
const orgIds = ids(orgs);
const users = must(
  "users",
  await db.from("partner_users").select("id, auth_user_id, email").in("org_id", inList(orgIds)),
);
const userIds = ids(users);
const demoRequests = must(
  "requests",
  await db.from("booking_requests").select("id, reference, quote_id").in("org_id", inList(orgIds)),
);
// Named extra requests: only staff test requests on the internal Live Luxe organisation, never another partner's.
let extraRequests = [];
if (extraRefs.length) {
  const found = must(
    "named requests",
    await db
      .from("booking_requests")
      .select("id, reference, quote_id, org_id, partner_orgs!inner(is_internal, name)")
      .in("reference", extraRefs),
  );
  for (const ref of extraRefs) {
    const r = found.find((x) => x.reference === ref);
    if (!r) console.warn(`  ${ref}: not found, skipped`);
    else if (!orgIds.includes(r.org_id) && !r.partner_orgs.is_internal) {
      console.error(
        `REFUSED: ${ref} belongs to the partner "${r.partner_orgs.name}", not the demo or Live Luxe's own organisation.`,
      );
      process.exit(2);
    } else extraRequests.push(r);
  }
}
const requests = [...new Map([...demoRequests, ...extraRequests].map((r) => [r.id, r])).values()];
const reqIds = ids(requests);
const quotes = must("quotes", await db.from("quotes").select("id").in("org_id", inList(orgIds)));
const quoteIds = [...new Set([...ids(quotes), ...ids(requests, "quote_id")])];
const payments = must(
  "payments",
  await db.from("payments").select("id, stripe_payment_intent_id").in("booking_id", inList(reqIds)),
);
const invoicesByOrg = must(
  "invoices",
  await db.from("invoices").select("id, stripe_invoice_id").in("org_id", inList(orgIds)),
);
const invoicesByReq = must(
  "invoices",
  await db.from("invoices").select("id, stripe_invoice_id").in("booking_id", inList(reqIds)),
);
const invoices = [...new Map([...invoicesByOrg, ...invoicesByReq].map((i) => [i.id, i])).values()];
const refunds = must(
  "refunds",
  await db.from("refunds").select("id, stripe_refund_id").in("booking_id", inList(reqIds)),
);
const invitations = must("invitations", await db.from("invitations").select("id, email").in("org_id", inList(orgIds)));
const stripeIds = [
  ...ids(payments, "stripe_payment_intent_id"),
  ...ids(invoices, "stripe_invoice_id"),
  ...ids(refunds, "stripe_refund_id"),
];
const entityIds = [
  ...orgIds,
  ...userIds,
  ...reqIds,
  ...quoteIds,
  ...ids(payments),
  ...ids(invoices),
  ...ids(refunds),
  ...ids(invitations),
];

console.log(`Demo organisation${orgs.length > 1 ? "s" : ""}: ${orgs.map((o) => `${o.name} (${o.id})`).join(", ")}`);
console.log(`  users:        ${users.length}${users.length ? ` (${users.map((u) => u.email).join(", ")})` : ""}`);
console.log(
  `  invitations:  ${invitations.length}${invitations.length ? ` (${invitations.map((i) => i.email).join(", ")})` : ""}`,
);
if (extraRequests.length)
  console.log(
    `  plus named test request(s): ${extraRequests.map((r) => `${r.reference} (${r.partner_orgs.name})`).join(", ")}`,
  );
console.log(
  `  requests:     ${requests.length}${
    requests.length
      ? ` (${requests
          .map((r) => r.reference)
          .sort()
          .join(", ")})`
      : ""
  }`,
);
console.log(`  quotes:       ${quoteIds.length}`);
console.log(`  payments:     ${payments.length}, invoices: ${invoices.length}, refunds: ${refunds.length}`);
console.log(
  `  Stripe:       ${orgs.filter((o) => o.stripe_customer_id).length} customer(s), ${stripeIds.length} payment/invoice/refund object(s)\n`,
);

if (!apply) {
  console.log("Dry run: nothing changed. Run with --yes to remove the above.");
  await reportNumbering();
  process.exit(0);
}

// --- Stripe test mode first: if this fails, the database still shows what to clean up ------------------------------
let stripeDone = 0;
for (const p of payments) {
  try {
    const pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id);
    if (
      ["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture"].includes(pi.status)
    ) {
      await stripe.paymentIntents.cancel(pi.id);
      stripeDone++;
    }
  } catch (e) {
    console.warn(`  Stripe payment ${p.stripe_payment_intent_id}: ${e.message}`);
  }
}
for (const inv of invoices) {
  try {
    const si = await stripe.invoices.retrieve(inv.stripe_invoice_id);
    if (si.status === "draft") await stripe.invoices.del(si.id);
    else if (si.status === "open") await stripe.invoices.voidInvoice(si.id);
    else continue;
    stripeDone++;
  } catch (e) {
    console.warn(`  Stripe invoice ${inv.stripe_invoice_id}: ${e.message}`);
  }
}
// The customer on the org row, plus any the portal created but failed to save (tagged with the org id).
const customerIds = new Set(ids(orgs, "stripe_customer_id"));
for (const orgId of orgIds) {
  try {
    const found = await stripe.customers.search({ query: `metadata['livluxe_org_id']:'${orgId}'` });
    for (const c of found.data) customerIds.add(c.id);
  } catch (e) {
    console.warn(`  Stripe customer search: ${e.message}`);
  }
}
for (const id of customerIds) {
  try {
    await stripe.customers.del(id);
    stripeDone++;
  } catch (e) {
    console.warn(`  Stripe customer ${id}: ${e.message}`);
  }
}
console.log(`Stripe test mode: ${stripeDone} object(s) cancelled, voided or deleted.`);

// --- Database, children before parents ------------------------------------------------------------------------------
const step = async (name, q) => {
  const { error, count } = await q;
  if (error) throw new Error(`${name}: ${error.message}`);
  if (count) console.log(`  ${name}: ${count}`);
};
const del = (table) => db.from(table).delete({ count: "exact" });
const R = inList(reqIds);
const U = inList(userIds);

await step("modifications", del("booking_modifications").in("booking_id", R));
await step("disputes", del("disputes").in("booking_id", R));
await step("refunds", del("refunds").in("booking_id", R));
await step("payments", del("payments").in("booking_id", R));
await step("invoices", del("invoices").in("id", inList(ids(invoices))));
await step(
  "unlink lineage",
  db.from("booking_requests").update({ linked_request_id: null }).in("linked_request_id", R),
);
// Cascades to holds, status history, comments, documents and the check-in access log of these requests.
await step("requests", del("booking_requests").in("id", R));
await step("holds", del("inventory_holds").in("org_id", inList(orgIds)));
await step("unlink quotes", db.from("quotes").update({ supersedes_id: null }).in("supersedes_id", inList(quoteIds)));
await step("quotes", del("quotes").in("id", inList(quoteIds)));
await step("rate cards", del("rate_cards").in("org_id", inList(orgIds)));
await step("documents", del("partner_documents").in("org_id", inList(orgIds)));
await step("invitations", del("invitations").in("org_id", inList(orgIds)));
await step("saved searches", del("saved_searches").in("org_id", inList(orgIds)));
await step("notifications", del("notifications").in("user_id", U));
await step("check-in views", del("checkin_access_log").in("user_id", U));
// Audit rows about demo things or by demo people; the audit history of everything else is untouched.
await step("audit (by demo users)", del("audit_log").in("actor_id", U));
for (let i = 0; i < entityIds.length; i += 100)
  await step("audit (about demo records)", del("audit_log").in("entity_id", entityIds.slice(i, i + 100)));
if (stripeIds.length) {
  await step("reconciliation exceptions", del("reconciliation_exceptions").in("external_id", stripeIds));
  await step("reconciliation exceptions", del("reconciliation_exceptions").in("entity_id", inList(entityIds)));
}
await step("unlink inviters", db.from("partner_users").update({ invited_by: null }).in("invited_by", U));
await step("users", del("partner_users").in("id", U));
let authRemoved = 0;
for (const u of users) {
  if (!u.auth_user_id) continue;
  const { error } = await db.auth.admin.deleteUser(u.auth_user_id);
  if (error) console.warn(`  sign-in account ${u.email}: ${error.message}`);
  else authRemoved++;
}
if (authRemoved) console.log(`  sign-in accounts: ${authRemoved}`);
await step("organisation", del("partner_orgs").in("id", inList(orgIds)));

console.log(`\nDone. ${orgs.map((o) => `"${o.name}"`).join(" and ")} and their data are gone.`);
await reportNumbering();

/** Request references come from one database sequence; say what the next one will be and how to restart it. */
async function reportNumbering() {
  const { data: others } = await db.from("partner_orgs").select("name").eq("is_internal", false);
  console.log(
    others?.length
      ? `\nPartner organisations still here (not demo data, left alone): ${others.map((o) => o.name).join(", ")}`
      : "\nNo partner organisations remain.",
  );
  const { data: last } = await db
    .from("booking_requests")
    .select("reference")
    .order("reference", { ascending: false })
    .limit(1);
  const { count } = await db.from("booking_requests").select("id", { count: "exact", head: true });
  console.log(
    `\nRequest numbering: ${count ?? 0} request(s) remain${last?.[0] ? `, highest ${last[0].reference}` : ""}. ` +
      "The counter is a database sequence and does not go back on its own: the next request takes the number after the " +
      "highest ever issued.",
  );
  if (!count)
    console.log(
      "No requests remain, so restarting at LLX-…-000001 is safe. In the Supabase SQL Editor (test project) run:\n" +
        "  select setval('booking_reference_seq', 1, false);",
    );
}
