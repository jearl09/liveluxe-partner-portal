#!/usr/bin/env node
/**
 * Apply one SQL migration file to the database in SUPABASE_DB_URL (from .env.local).
 *
 *   node scripts/db-apply.mjs supabase/migrations/20261012100000_rate_cards_partners_sla.sql
 *
 * Runs the whole file in a single transaction and records it in
 * public.schema_migrations_applied so a second run is a no-op. This is the
 * dashboard-free way to apply migrations until the project moves to `supabase db push`.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/db-apply.mjs <migration.sql>");
  process.exit(2);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local");
  process.exit(2);
}

const name = basename(file);
const sqlText = readFileSync(resolve(file), "utf8");
const sql = postgres(url, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

try {
  await sql.unsafe(`create table if not exists public.schema_migrations_applied (
    name text primary key, applied_at timestamptz not null default now())`);
  const [done] = await sql`select 1 from public.schema_migrations_applied where name = ${name}`;
  if (done) {
    console.log(`already applied: ${name}`);
  } else {
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`insert into public.schema_migrations_applied (name) values (${name})`;
    });
    console.log(`applied: ${name}`);
  }
} catch (e) {
  console.error(`failed: ${name}\n${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
