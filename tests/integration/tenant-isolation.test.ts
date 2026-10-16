/**
 * Tenant isolation at the database (spec §8.3 RLS, §20 scenarios 14–15): a signed-in partner, calling the database
 * API directly with their own session rather than through the portal's screens, can neither read another
 * partner's records nor change what only Live Luxe or the server may change.
 *
 * Runs against a real Postgres with every migration applied: the local Supabase in CI (`SUPABASE_DB_URL`). Each
 * test builds its own two organisations inside a transaction and rolls it back, so it leaves nothing behind and
 * is safe against a shared database. `TENANT_TEST_PRELOAD` (a .sql path) runs first inside that transaction, to
 * check a migration that is not applied yet without applying it.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL;
const PRELOAD = process.env.TENANT_TEST_PRELOAD;

type Tx = postgres.TransactionSql;
const ROLLBACK = Symbol("rollback");

describe.skipIf(!DB_URL)("tenant isolation (RLS)", () => {
  const sql = postgres(DB_URL ?? "", { max: 1, onnotice: () => {}, prepare: false });
  afterAll(() => sql.end());

  /** Run `fn` in a transaction that is always rolled back. */
  async function inTx(fn: (tx: Tx, w: World) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        if (PRELOAD) await tx.unsafe(readFileSync(PRELOAD, "utf8"));
        await fn(tx, await buildWorld(tx));
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  }

  /** Become a signed-in user for the rest of the transaction, exactly as PostgREST does for a session. */
  async function actAs(tx: Tx, u: { authId: string; orgId: string; role: string }) {
    const claims = JSON.stringify({ sub: u.authId, org_id: u.orgId, user_role: u.role, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
  }

  /**
   * Expect a statement to be refused, optionally with a specific SQLSTATE (42501 = no permission). A savepoint keeps
   * the transaction usable afterwards.
   */
  async function refused(tx: Tx, run: (sp: Tx) => Promise<unknown>, code?: string) {
    let error: { code?: string } | null = null;
    await tx.savepoint(async (sp) => run(sp as unknown as Tx)).catch((e) => (error = e));
    expect(error, "expected the database to refuse this").not.toBeNull();
    if (code) expect((error as { code?: string } | null)?.code).toBe(code);
  }

  it("a partner sees none of another partner's records", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      const b = w.b;
      const counts = {
        partner_orgs: await tx`select count(*)::int as n from partner_orgs where id = ${b.orgId}`,
        partner_users: await tx`select count(*)::int as n from partner_users where org_id = ${b.orgId}`,
        booking_requests: await tx`select count(*)::int as n from booking_requests where id = ${b.requestId}`,
        quotes: await tx`select count(*)::int as n from quotes where org_id = ${b.orgId}`,
        booking_comments: await tx`select count(*)::int as n from booking_comments where booking_id = ${b.requestId}`,
        booking_status_history:
          await tx`select count(*)::int as n from booking_status_history where booking_id = ${b.requestId}`,
        booking_documents: await tx`select count(*)::int as n from booking_documents where booking_id = ${b.requestId}`,
        inventory_holds: await tx`select count(*)::int as n from inventory_holds where org_id = ${b.orgId}`,
        payments: await tx`select count(*)::int as n from payments where booking_id = ${b.requestId}`,
        invoices: await tx`select count(*)::int as n from invoices where org_id = ${b.orgId}`,
        rate_cards: await tx`select count(*)::int as n from rate_cards where org_id = ${b.orgId}`,
        partner_documents: await tx`select count(*)::int as n from partner_documents where org_id = ${b.orgId}`,
        invitations: await tx`select count(*)::int as n from invitations where org_id = ${b.orgId}`,
        notifications: await tx`select count(*)::int as n from notifications where user_id = ${b.admin.userId}`,
        audit_log: await tx`select count(*)::int as n from audit_log where entity_id = ${b.requestId}`,
        listing_access_details: await tx`select count(*)::int as n from listing_access_details`,
        settings: await tx`select count(*)::int as n from settings`,
      };
      const leaks = Object.entries(counts).filter(([, r]) => r[0]!.n !== 0);
      expect(leaks.map(([t, r]) => `${t}: ${r[0]!.n}`)).toEqual([]);
    });
  });

  it("a partner sees their own request and its shared comments, never Live Luxe's internal notes", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      const own = await tx`select count(*)::int as n from booking_requests where id = ${w.a.requestId}`;
      expect(own[0]!.n).toBe(1);
      const comments = await tx`select visibility::text as v from booking_comments where booking_id = ${w.a.requestId}`;
      expect(comments.map((c) => c.v)).toEqual(["shared"]);
    });
  });

  it("a partner cannot change or comment on another partner's request", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      const updated = await tx`update booking_requests set notes = 'x' where id = ${w.b.requestId} returning id`;
      expect(updated.length).toBe(0);
      await refused(
        tx,
        (sp) =>
          sp`insert into booking_comments (booking_id, author_id, body) values (${w.b.requestId}, ${w.a.admin.userId}, 'hi')`,
      );
      await refused(tx, (sp) => sp`select apply_booking_transition(${w.b.requestId}, 'SUBMITTED', 'CANCELLED')`);
    });
  });

  it("a partner cannot write their own requests, quotes or organisation directly", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      const total = await tx`update booking_requests set total_cents = 100 where id = ${w.a.requestId} returning id`;
      expect(total.length, "own request total").toBe(0);
      const moved =
        await tx`update booking_requests set org_id = ${w.b.orgId} where id = ${w.a.requestId} returning id`;
      expect(moved.length, "own request moved to another org").toBe(0);
      await refused(
        tx,
        (sp) => sp`insert into booking_requests (reference, org_id, listing_id, created_by, check_in, check_out, status)
                   values ('LLX-TEST-DIRECT', ${w.a.orgId}, ${w.listingId}, ${w.a.admin.userId}, '2031-01-01', '2031-01-05', 'SUBMITTED')`,
      );
      await refused(
        tx,
        (
          sp,
        ) => sp`insert into quotes (listing_id, org_id, check_in, check_out, line_items, subtotal_cents, total_cents, price_hash, expires_at)
                   values (${w.listingId}, ${w.a.orgId}, '2031-01-01', '2031-01-05', '[]', 1, 1, 'x', now() + interval '1 day')`,
      );
      const org = await tx`update partner_orgs set credit_limit_cents = 999999999 where id = ${w.a.orgId} returning id`;
      expect(org.length, "own organisation").toBe(0);
    });
  });

  it("a partner cannot submit through the database with their own prices", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      await refused(
        tx,
        (sp) => sp`select * from submit_booking_request(
          ${w.listingId}::uuid, '2031-02-01'::date, '2031-02-05'::date, 1, 0, 0, '[]'::jsonb, 1::bigint, 0::bigint, 1::bigint,
          0::bigint, 'x', null::uuid, null::int, 'G', 'g@example.com', '1', 'C', 'P', '', '', now())`,
        "42501",
      );
    });
  });

  it("accepting a counter-offer cannot change its dates, total or hold", async () => {
    await inTx(async (tx, w) => {
      await tx`update booking_requests set status = 'COUNTER_OFFERED' where id = ${w.a.requestId}`;
      await actAs(tx, w.a.admin);
      await refused(
        tx,
        (sp) =>
          sp`select apply_booking_transition(${w.a.requestId}, 'COUNTER_OFFERED', 'UNDER_REVIEW', null, null, null, null, null, 100::bigint)`,
      );
      await refused(
        tx,
        (sp) =>
          sp`select apply_booking_transition(${w.a.requestId}, 'COUNTER_OFFERED', 'UNDER_REVIEW', null, null, null, null, null, null, null, 9999)`,
      );
      const ok =
        await tx`select (apply_booking_transition(${w.a.requestId}, 'COUNTER_OFFERED', 'UNDER_REVIEW')).status::text as s`;
      expect(ok[0]!.s).toBe("UNDER_REVIEW");
    });
  });

  it("a partner admin cannot create Live Luxe staff, by invitation or directly", async () => {
    await inTx(async (tx, w) => {
      await actAs(tx, w.a.admin);
      for (const role of ["livluxe_admin", "livluxe_ops", "livluxe_finance"]) {
        await refused(
          tx,
          (sp) => sp`insert into invitations (org_id, email, role, token_hash, expires_at)
                     values (${w.a.orgId}, ${`x-${role}@example.com`}, ${role}, ${randomUUID()}, now() + interval '7 days')`,
        );
      }
      await refused(tx, (sp) => sp`update partner_users set role = 'livluxe_admin' where id = ${w.a.booker.userId}`);
      const invite = await tx`insert into invitations (org_id, email, role, token_hash, expires_at)
                              values (${w.a.orgId}, 'colleague@example.com', 'partner_booker', ${randomUUID()}, now() + interval '7 days')
                              returning id`;
      expect(invite.length, "a partner role is still fine").toBe(1);
    });
  });

  it("staff roles exist only in the internal Live Luxe organisation, whoever writes them", async () => {
    await inTx(async (tx, w) => {
      // As the database owner (the service role bypasses RLS too): the trigger still refuses.
      await refused(
        tx,
        (sp) => sp`insert into invitations (org_id, email, role, token_hash, expires_at)
                   values (${w.a.orgId}, 'staff@example.com', 'livluxe_admin', ${randomUUID()}, now() + interval '7 days')`,
      );
    });
  });

  it("every table in the public schema has row-level security on", async () => {
    // Tables an extension owns (PostGIS's spatial_ref_sys) are reference data, not ours.
    const open = await sql`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
      order by 1`;
    expect(open.map((r) => r.name)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures: two partner organisations, each with an admin, a booker and one request on a shared listing.
// ---------------------------------------------------------------------------

interface Member {
  authId: string;
  userId: string;
  orgId: string;
  role: string;
}
interface Org {
  orgId: string;
  admin: Member;
  booker: Member;
  requestId: string;
}
interface World {
  listingId: string;
  a: Org;
  b: Org;
}

async function buildWorld(tx: Tx): Promise<World> {
  const [listing] = await tx`
    insert into listings (hostaway_listing_id, public_name, is_active, is_partner_visible, max_guests)
    values (${900_000_000 + Math.floor(Math.random() * 99_999_999)}, 'Isolation test listing', true, true, 4)
    returning id`;
  const listingId = listing!.id as string;
  const a = await buildOrg(tx, listingId, "A", "2031-03-01", "2031-03-05");
  const b = await buildOrg(tx, listingId, "B", "2031-04-01", "2031-04-05");
  return { listingId, a, b };
}

async function buildOrg(tx: Tx, listingId: string, tag: string, checkIn: string, checkOut: string): Promise<Org> {
  const [org] = await tx`
    insert into partner_orgs (name, type, status) values (${`Isolation test ${tag}`}, 'insurance', 'active') returning id`;
  const orgId = org!.id as string;
  const member = async (role: string): Promise<Member> => {
    const authId = randomUUID();
    const email = `isolation-${tag.toLowerCase()}-${role}-${authId.slice(0, 8)}@example.com`;
    await tx`insert into auth.users (id, email) values (${authId}, ${email})`;
    const [u] = await tx`
      insert into partner_users (auth_user_id, org_id, role, email, full_name, status)
      values (${authId}, ${orgId}, ${role}, ${email}, ${`${tag} ${role}`}, 'active') returning id`;
    return { authId, userId: u!.id as string, orgId, role };
  };
  const admin = await member("partner_admin");
  const booker = await member("partner_booker");
  const [quote] = await tx`
    insert into quotes (listing_id, org_id, created_by, check_in, check_out, line_items, subtotal_cents, total_cents, price_hash, expires_at)
    values (${listingId}, ${orgId}, ${admin.userId}, ${checkIn}, ${checkOut}, '[]', 100000, 110000, 'h', now() + interval '2 days')
    returning id`;
  const [req] = await tx`
    insert into booking_requests (reference, org_id, listing_id, quote_id, created_by, check_in, check_out, status, total_cents)
    values (${`LLX-TEST-${tag}-${randomUUID().slice(0, 8)}`}, ${orgId}, ${listingId}, ${quote!.id}, ${admin.userId},
            ${checkIn}, ${checkOut}, 'SUBMITTED', 110000)
    returning id`;
  const requestId = req!.id as string;
  await tx`insert into booking_comments (booking_id, author_id, body, visibility) values
             (${requestId}, ${admin.userId}, 'shared note', 'shared'),
             (${requestId}, ${admin.userId}, 'internal note', 'internal')`;
  await tx`insert into booking_status_history (booking_id, to_status, actor_type) values (${requestId}, 'SUBMITTED', 'partner')`;
  await tx`insert into booking_documents (booking_id, storage_path, file_name) values (${requestId}, 'x/y.pdf', 'y.pdf')`;
  await tx`insert into inventory_holds (listing_id, booking_id, org_id, stay_range, expires_at)
           values (${listingId}, ${requestId}, ${orgId}, daterange(${checkIn}::date, ${checkOut}::date, '[)'), now() + interval '1 day')`;
  await tx`insert into payments (booking_id, stripe_payment_intent_id, status) values (${requestId}, ${`pi_test_${randomUUID()}`}, 'requires_capture')`;
  await tx`insert into invoices (org_id, stripe_invoice_id, status, amount_due_cents) values (${orgId}, ${`in_test_${randomUUID()}`}, 'open', 110000)`;
  await tx`insert into rate_cards (org_id, name, valid_range) values (${orgId}, 'Test card', daterange('2031-01-01', '2032-01-01', '[)'))`;
  await tx`insert into partner_documents (org_id, type, storage_path, file_name) values (${orgId}, 'coi', 'a/b.pdf', 'b.pdf')`;
  await tx`insert into invitations (org_id, email, role, token_hash, expires_at)
           values (${orgId}, ${`invitee-${tag.toLowerCase()}@example.com`}, 'partner_booker', ${randomUUID()}, now() + interval '7 days')`;
  await tx`insert into notifications (user_id, type, payload) values (${admin.userId}, 'request_received', '{}')`;
  await tx`insert into audit_log (actor_type, action, entity_type, entity_id) values ('partner', 'test', 'booking_request', ${requestId})`;
  await tx`insert into listing_access_details (listing_id) values (${listingId}) on conflict do nothing`;
  return { orgId, admin, booker, requestId };
}
