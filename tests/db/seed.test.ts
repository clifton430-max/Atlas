// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './harness';

describe('seed and service-only tables', () => {
  it('seed.sql loads clearly-flagged dev fixtures, idempotently, with local times preserved', async () => {
    const t = await createTestDb();
    const seed = readFileSync(join(__dirname, '../../supabase/seed.sql'), 'utf8');
    await t.db.exec(seed);
    await t.db.exec(seed); // re-runnable
    const rows = await t.query<{ n: number; flagged: number; named: number }>(
      `select count(*)::int n, count(*) filter (where is_dev_fixture)::int flagged,
              count(*) filter (where name like 'Sample:%')::int named from public.events`);
    expect(rows[0].n).toBe(10);
    expect(rows[0].flagged).toBe(10);
    expect(rows[0].named).toBe(10);
    // Local wall-clock time round-trips through the stored instant in the event's zone.
    const jazz = await t.one<{ local: string }>(
      `select to_char(starts_at at time zone timezone, 'HH24:MI') as local from public.events where name like '%Jazz%'`);
    expect(jazz.local).toBe('23:30');
    const unmapped = await t.one<{ latitude: number | null }>(`select latitude from public.events where name like '%Unknown Location%'`);
    expect(unmapped.latitude).toBeNull();
  });

  it('event_fetch_log is invisible to clients', async () => {
    const t = await createTestDb();
    const u = await t.createUser('zed');
    await t.as(u);
    expect(await t.fails(`select * from public.event_fetch_log`)).toMatch(/permission denied/);
    await t.asAnon();
    expect(await t.fails(`select * from public.event_fetch_log`)).toMatch(/permission denied/);
  });
});

describe('edge rate limits', () => {
  it('counts within a window, resets after it, and is service-role only', async () => {
    const t = await createTestDb();
    await t.asAdmin();
    const take = async () => (await t.one<{ ok: boolean }>(`select public.edge_consume_rate_limit('ip:test', 2, 60) as ok`)).ok;
    expect([await take(), await take(), await take()]).toEqual([true, true, false]);
    await t.query(`update public.edge_rate_limits set window_start = now() - interval '61 seconds'`);
    expect(await take()).toBe(true);

    const u = await t.createUser('rl');
    await t.as(u);
    expect(await t.fails(`select public.edge_consume_rate_limit('ip:x', 100, 60)`)).toMatch(/permission denied/);
    expect(await t.fails(`select * from public.edge_rate_limits`)).toMatch(/permission denied/);
  });
});
