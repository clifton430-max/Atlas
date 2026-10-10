/**
 * PGlite-based harness for testing Atlas migrations, RLS and RPCs without a
 * running Supabase stack.
 *
 * PGlite is real PostgreSQL compiled to WASM. We stub the small parts of the
 * Supabase platform the migrations depend on:
 *   - roles anon / authenticated / service_role (service_role BYPASSRLS)
 *   - auth.users and auth.uid() (reads the `request.jwt.claim.sub` setting,
 *     like Supabase's implementation)
 *   - storage.buckets / storage.objects with RLS enabled
 *   - Supabase's default privileges on the public schema
 *
 * Tests then switch identity with `as(userId)` / `asAnon()` and issue SQL
 * directly — i.e. they exercise the database exactly as a malicious client
 * with a valid JWT could, not through the UI.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Mirror Supabase defaults: public schema objects are broadly granted, and
-- RLS + explicit revokes in the migrations must do the protecting.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export interface TestDb {
  db: PGlite;
  /** Act as an authenticated user (JWT sub = userId). */
  as(userId: string): Promise<void>;
  /** Act as an anonymous visitor. */
  asAnon(): Promise<void>;
  /** Act as the privileged migration/service owner. */
  asAdmin(): Promise<void>;
  /** Create an auth user (fires the signup trigger) and return its id. */
  createUser(username: string, opts?: { discoverable?: boolean }): Promise<string>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  /** Expect the statement to fail; returns the error message. */
  fails(sql: string, params?: unknown[]): Promise<string>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`, { cause: e });
    }
  }

  const setIdentity = async (sub: string, role: string | null) => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
    if (role) await db.exec(`set role ${role}`);
  };

  const api: TestDb = {
    db,
    as: (id) => setIdentity(id, 'authenticated'),
    asAnon: () => setIdentity('', 'anon'),
    asAdmin: () => setIdentity('', null),
    async createUser(username, opts) {
      await api.asAdmin();
      const id = crypto.randomUUID();
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
        id,
        `${username}@example.test`,
        JSON.stringify({ username, display_name: username.toUpperCase() }),
      ]);
      if (opts?.discoverable === false) {
        await db.query(`update public.profiles set discoverable = false where id = $1`, [id]);
      }
      return id;
    },
    async query(sql, params) {
      const r = await db.query(sql, params);
      return r.rows as never;
    },
    async one(sql, params) {
      const rows = await api.query(sql, params);
      if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}`);
      return rows[0] as never;
    },
    async fails(sql, params) {
      try {
        await db.query(sql, params);
      } catch (e) {
        return (e as Error).message;
      }
      throw new Error(`Expected statement to fail: ${sql}`);
    },
  };
  return api;
}
