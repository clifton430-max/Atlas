/**
 * Meetups, attendance and notifications (migration 0015), exercised as real
 * identities against the full migrated schema (PGlite).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
let owner: string; let editor: string; let viewer: string; let stranger: string;
let mapId: string; let pinId: string;

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function join(token: string, user: string) {
  await t.as(user);
  await t.query(`select public.accept_collab_invitation($1)`, [token]);
}

beforeEach(async () => {
  t = await createTestDb();
  owner = await t.createUser('owner'); editor = await t.createUser('editor');
  viewer = await t.createUser('viewer'); stranger = await t.createUser('stranger');
  await t.as(owner);
  mapId = (await t.one<{ create_collab_map: string }>(`select public.create_collab_map('Trip', null)`)).create_collab_map;
  const e = await t.one<{ token: string }>(`select * from public.create_collab_invitation($1, 'editor', null, 24, null)`, [mapId]);
  const v = await t.one<{ token: string }>(`select * from public.create_collab_invitation($1, 'viewer', null, 24, null)`, [mapId]);
  await join(e.token, editor);
  await join(v.token, viewer);
  await t.as(editor);
  pinId = (await t.one<{ add_to_collab: string }>(`select public.add_to_collab($1, p_place_ref => 'osm:node/1', p_title => 'Cafe', p_latitude => 1, p_longitude => 1)`, [mapId])).add_to_collab;
});

const create = (extra = '', params: unknown[] = []) =>
  t.one<{ create_meetup: string }>(`select public.create_meetup($1, $2, $3, 'America/Chicago'${extra})`, [pinId, inHours(1), inHours(3), ...params]);

describe('meetups', () => {
  it('editors/owners create; viewers and strangers cannot; schedules are validated', async () => {
    await t.as(viewer);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC')`, [pinId, inHours(1), inHours(2)])).toMatch(/editor access/);
    await t.as(stranger);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC')`, [pinId, inHours(1), inHours(2)])).toMatch(/editor access/);
    await t.as(editor);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC')`, [pinId, inHours(3), inHours(1)])).toMatch(/end after it starts/);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC')`, [pinId, inHours(1), inHours(24 * 8)])).toMatch(/at most 7 days/);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'Mars/Base; drop')`, [pinId, inHours(1), inHours(2)])).toMatch(/time zone/);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC', null, 0)`, [pinId, inHours(1), inHours(2)])).toMatch(/Capacity/);
    expect(await t.fails(`select public.create_meetup($1, $2, $3, 'UTC')`, [pinId, inHours(-5), inHours(-4)])).toMatch(/already be over/);
    const { create_meetup: id } = await create();
    // Organiser attends automatically; direct table writes are impossible.
    expect(await t.query(`select user_id from public.meetup_attendees where meetup_id = $1`, [id])).toEqual([{ user_id: editor }]);
    expect(await t.fails(`insert into public.meetups (collab_map_id, shared_pin_id, created_by, starts_at, ends_at, timezone) values ($1, $2, $3, now(), now() + interval '1 hour', 'UTC')`, [mapId, pinId, editor])).toMatch(/permission denied/);
    expect(await t.fails(`insert into public.meetup_attendees (meetup_id, user_id, collab_map_id) values ($1, $2, $3)`, [id, owner, mapId])).toMatch(/permission denied/);
  });

  it('members join and leave idempotently; capacity is enforced atomically', async () => {
    await t.as(editor);
    const { create_meetup: id } = await create(', null, 2');
    await t.as(viewer);
    expect((await t.one<{ join_meetup: number }>(`select public.join_meetup($1)`, [id])).join_meetup).toBe(2);
    expect((await t.one<{ join_meetup: number }>(`select public.join_meetup($1)`, [id])).join_meetup).toBe(2); // no duplicate
    await t.as(owner);
    expect(await t.fails(`select public.join_meetup($1)`, [id])).toMatch(/full/);
    await t.as(viewer);
    expect((await t.one<{ leave_meetup: number }>(`select public.leave_meetup($1)`, [id])).leave_meetup).toBe(1);
    await t.as(owner);
    expect((await t.one<{ join_meetup: number }>(`select public.join_meetup($1)`, [id])).join_meetup).toBe(2);
    await t.as(stranger);
    expect(await t.fails(`select public.join_meetup($1)`, [id])).toMatch(/not found/);
    expect(await t.query(`select id from public.meetups`)).toEqual([]);
    expect(await t.query(`select * from public.meetup_counts($1)`, [mapId])).toEqual([]);
  });

  it('only the organiser or map owner can edit, reschedule and cancel', async () => {
    await t.as(editor);
    const { create_meetup: id } = await create();
    await t.as(viewer);
    await t.query(`select public.join_meetup($1)`, [id]);
    expect(await t.fails(`select public.update_meetup($1, $2, $3, 'UTC', 'x', null, 'members')`, [id, inHours(2), inHours(4)])).toMatch(/organiser or the map owner/);
    expect(await t.fails(`select public.cancel_meetup($1)`, [id])).toMatch(/organiser or the map owner/);
    await t.as(editor);
    expect(await t.fails(`select public.update_meetup($1, $2, $3, 'UTC', null, 1, 'members')`, [id, inHours(2), inHours(4)])).toMatch(/lower than the 2 people/);
    await t.query(`select public.update_meetup($1, $2, $3, 'Europe/Paris', 'Bring snacks', 10, 'members')`, [id, inHours(2), inHours(4)]);
    await t.as(owner);
    await t.query(`select public.cancel_meetup($1)`, [id]);
    await t.as(viewer);
    expect(await t.fails(`select public.join_meetup($1)`, [id])).toMatch(/cancelled/);
    expect((await t.one<{ timezone: string; cancelled: boolean }>(`select timezone, cancelled_at is not null cancelled from public.meetups where id = $1`, [id]))).toEqual({ timezone: 'Europe/Paris', cancelled: true });
  });

  it('private attendee lists: members see counts, names only for organiser, owner and self', async () => {
    await t.as(editor);
    const { create_meetup: id } = await create(", null, null, 'private_attendees'");
    await t.as(viewer);
    await t.query(`select public.join_meetup($1)`, [id]);
    expect((await t.query<{ user_id: string }>(`select user_id from public.meetup_attendees where meetup_id = $1`, [id])).map((r) => r.user_id)).toEqual([viewer]); // only self
    await t.as(owner);
    expect(await t.query(`select user_id from public.meetup_attendees where meetup_id = $1 order by user_id`, [id])).toHaveLength(2);
    expect(await t.one(`select attendees, me_going from public.meetup_counts($1)`, [mapId])).toEqual({ attendees: 2, me_going: false });
  });

  it('notifications: relevant recipients only, no duplicates, hidden after losing access', async () => {
    const mine = async (u: string) => { await t.as(u); return t.query<{ kind: string }>(`select kind from public.notifications order by created_at, kind`); };
    // The pin added in beforeEach notified owner and viewer, not the editor who added it.
    expect((await mine(owner)).map((n) => n.kind)).toEqual(['shared_pin_added']);
    expect(await mine(editor)).toEqual([]);
    await t.as(editor);
    const { create_meetup: id } = await create();
    await t.as(viewer);
    await t.query(`select public.join_meetup($1)`, [id]);
    await t.query(`select public.leave_meetup($1)`, [id]);
    await t.query(`select public.join_meetup($1)`, [id]); // re-join: no duplicate notification
    const editorNotes = await mine(editor);
    expect(editorNotes.filter((n) => n.kind === 'meetup_joined')).toHaveLength(1);
    expect((await mine(owner)).map((n) => n.kind)).toEqual(['shared_pin_added', 'meetup_created']); // joins go to the organiser only
    // Same reschedule twice -> one notification each recipient.
    await t.as(editor);
    for (let i = 0; i < 2; i++) await t.query(`select public.update_meetup($1, $2, $3, 'UTC', null, null, 'members')`, [id, '2030-01-01T10:00:00Z', '2030-01-01T12:00:00Z']);
    expect((await mine(viewer)).filter((n) => n.kind === 'meetup_rescheduled')).toHaveLength(1);
    // Mark read: allowed; changing anything else isn't.
    await t.as(viewer);
    await t.query(`update public.notifications set read_at = now()`);
    expect(await t.fails(`update public.notifications set title = 'x'`)).toMatch(/permission denied/);
    expect(await t.fails(`insert into public.notifications (user_id, kind, title, dedupe_key) values ($1, 'meetup_joined', 'fake', 'k')`, [viewer])).toMatch(/permission denied/);
    // Removed from the map -> its notifications disappear for that user.
    await t.as(owner);
    await t.query(`delete from public.collab_members where map_id = $1 and user_id = $2`, [mapId, viewer]);
    expect(await mine(viewer)).toEqual([]);
    expect(await mine(stranger)).toEqual([]);
  });

  it('custom pins anywhere: editors only, validated, idempotent on retry, editable by author or owner', async () => {
    await t.as(viewer);
    expect(await t.fails(`select public.create_shared_custom_pin($1, 'Bench', 1.5, 2.5)`, [mapId])).toMatch(/editor access/);
    await t.as(stranger);
    expect(await t.fails(`select public.create_shared_custom_pin($1, 'Bench', 1.5, 2.5)`, [mapId])).toMatch(/editor access/);
    await t.as(editor);
    expect(await t.fails(`select public.create_shared_custom_pin($1, '  ', 1.5, 2.5)`, [mapId])).toMatch(/title/);
    expect(await t.fails(`select public.create_shared_custom_pin($1, 'X', 91, 2.5)`, [mapId])).toMatch(/coordinates/);
    const a = (await t.one<{ create_shared_custom_pin: string }>(`select public.create_shared_custom_pin($1, 'Bench', 1.5, 2.5, 'Under the oak')`, [mapId])).create_shared_custom_pin;
    const b = (await t.one<{ create_shared_custom_pin: string }>(`select public.create_shared_custom_pin($1, 'Bench', 1.5, 2.5, 'Under the oak')`, [mapId])).create_shared_custom_pin;
    expect(b).toBe(a); // retry -> same pin, no duplicate
    expect((await t.query(`select count(*)::int as n from public.shared_pins where title = 'Bench'`))[0]).toEqual({ n: 1 });
    // Viewers see it (members), cannot edit it.
    await t.as(viewer);
    expect(await t.query(`select note from public.shared_pins where id = $1`, [a])).toEqual([{ note: 'Under the oak' }]);
    expect(await t.fails(`select public.update_shared_pin_details($1, 'Mine now')`, [a])).toMatch(/Only the person/);
    // Author edits partially (note kept); owner may edit too.
    await t.as(editor);
    await t.query(`select public.update_shared_pin_details($1, p_title => 'Oak bench')`, [a]);
    expect(await t.query(`select title, note from public.shared_pins where id = $1`, [a])).toEqual([{ title: 'Oak bench', note: 'Under the oak' }]);
    await t.as(owner);
    await t.query(`select public.update_shared_pin_details($1, p_latitude => 1.6, p_longitude => 2.6)`, [a]);
    expect(await t.query(`select latitude, longitude from public.shared_pins where id = $1`, [a])).toEqual([{ latitude: 1.6, longitude: 2.6 }]);
    await t.as(stranger);
    expect(await t.fails(`select public.update_shared_pin_details($1, 'x')`, [a])).toMatch(/not found/);
  });

  it('meetups at arbitrary coordinates create pin + meetup atomically and retry safely', async () => {
    await t.as(viewer);
    expect(await t.fails(`select public.create_meetup_at($1, 'Picnic', 3, 4, $2, $3, 'UTC')`, [mapId, inHours(1), inHours(2)])).toMatch(/editor access/);
    await t.as(editor);
    // Invalid schedule -> nothing is created (the pin insert rolls back too).
    expect(await t.fails(`select public.create_meetup_at($1, 'Picnic', 3, 4, $2, $3, 'UTC')`, [mapId, inHours(3), inHours(1)])).toMatch(/end after it starts/);
    expect((await t.query(`select count(*)::int as n from public.shared_pins where title = 'Picnic'`))[0]).toEqual({ n: 0 });
    const starts = inHours(1); const ends = inHours(2);
    const r1 = (await t.one<{ create_meetup_at: { shared_pin_id: string; meetup_id: string } }>(`select public.create_meetup_at($1, 'Picnic', 3, 4, $2, $3, 'UTC', 'Bring snacks', 5)`, [mapId, starts, ends])).create_meetup_at;
    const r2 = (await t.one<{ create_meetup_at: { shared_pin_id: string; meetup_id: string } }>(`select public.create_meetup_at($1, 'Picnic', 3, 4, $2, $3, 'UTC', 'Bring snacks', 5)`, [mapId, starts, ends])).create_meetup_at;
    expect(r2).toEqual(r1);
    expect(await t.query(`select latitude, longitude from public.shared_pins where id = $1`, [r1.shared_pin_id])).toEqual([{ latitude: 3, longitude: 4 }]);
    expect(await t.query(`select capacity, description from public.meetups where id = $1`, [r1.meetup_id])).toEqual([{ capacity: 5, description: 'Bring snacks' }]);
    expect(await t.query(`select user_id from public.meetup_attendees where meetup_id = $1`, [r1.meetup_id])).toEqual([{ user_id: editor }]);
  });
});
