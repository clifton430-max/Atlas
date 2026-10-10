// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTestDb } from './harness';

describe('migrations', () => {
  it('apply cleanly and bootstrap new users with a profile and private map', async () => {
    const t = await createTestDb();
    const alice = await t.createUser('alice');
    const profile = await t.one<{ username: string }>(`select username from public.profiles where id = $1`, [alice]);
    expect(profile.username).toBe('alice');
    const maps = await t.query(`select name from public.maps where owner_id = $1`, [alice]);
    expect(maps).toEqual([{ name: 'My Map' }]);
  });
});
