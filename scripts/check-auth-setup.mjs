#!/usr/bin/env node
/**
 * Diagnoses why sign-in may not be landing on a dashboard. Run from the project root:
 *   node scripts/check-auth-setup.mjs you@example.com
 *
 * Uses the service-role key from .env.local (never printed) to check, in order:
 *   1. the Phase 0 auth migration is applied (auth_rate_limit_hit exists)
 *   2. the user has an ACTIVE partner_users row
 *   3. the JWT claims hook is enabled (mints a throwaway session and decodes the token)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error(
    "usage: node scripts/check-auth-setup.mjs <email>   (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local)",
  );
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);
let failures = 0;

console.log("1. Phase 0 auth migration");
{
  const r = await fetch(`${url}/rest/v1/rpc/auth_rate_limit_hit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_key: "diag:probe", p_max: 1000, p_window_seconds: 1 }),
  });
  if (r.ok) ok("auth_rate_limit_hit() exists — rate limiting is active");
  else {
    failures++;
    bad(
      `auth_rate_limit_hit() missing (HTTP ${r.status}). Apply supabase/migrations/20261006120000_phase0_auth.sql in the SQL editor.`,
    );
  }
}

console.log("2. partner_users row");
let authUserId;
{
  const r = await fetch(
    `${url}/rest/v1/partner_users?email=eq.${encodeURIComponent(email)}&select=auth_user_id,role,status,org_id,mfa_enrolled`,
    { headers },
  );
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) {
    failures++;
    bad(`no partner_users row for ${email}. Insert one (see docs/GETTING-STARTED.md "Creating the first users").`);
  } else {
    const u = rows[0];
    authUserId = u.auth_user_id;
    if (u.status === "active") ok(`active · role ${u.role} · org ${u.org_id} · mfa_enrolled=${u.mfa_enrolled}`);
    else {
      failures++;
      bad(
        `row exists but status is '${u.status}' — the hook only issues claims for status='active'. UPDATE partner_users SET status='active' WHERE email='${email}';`,
      );
    }
  }
}

console.log("3. JWT claims hook");
if (!authUserId) bad("skipped (no partner_users row)");
else {
  const gl = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await gl.json();
  if (!gl.ok) {
    failures++;
    bad(
      `could not generate a probe link (${gl.status}: ${link.msg ?? link.message ?? "?"}). Does an auth user exist for ${email}?`,
    );
  } else {
    const v = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
    });
    const s = await v.json();
    if (!v.ok || !s.access_token) {
      failures++;
      bad(`probe sign-in failed (${v.status}: ${s.msg ?? s.error_description ?? "?"})`);
    } else {
      const claims = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString());
      if (claims.user_role && claims.org_id)
        ok(`hook enabled — token carries user_role=${claims.user_role}, org_id=${claims.org_id}`);
      else {
        failures++;
        bad(
          "hook NOT enabled: token has no user_role/org_id. Supabase → Authentication → Hooks → Customize Access Token (JWT) Claims → Postgres → public.custom_access_token_hook → Save. Then sign out and in.",
        );
      }
      // Revoke the probe session so nothing lingers.
      await fetch(`${url}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${s.access_token}` },
      }).catch(() => {});
    }
  }
}

console.log(
  failures
    ? `\n${failures} problem(s) found — fix them top to bottom, then sign in again.`
    : "\nAll good: sign in at /login.",
);
process.exit(failures ? 1 : 0);
