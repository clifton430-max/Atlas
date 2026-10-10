// @vitest-environment node
/**
 * Release-blocking privacy/authorization tests. Every assertion here is made
 * by issuing SQL directly as a specific identity (anon, owner, stranger,
 * friend, collaborator) — the same power a client holding a valid JWT has.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
let alice: string;
let bob: string;
let carol: string;
let aliceMap: string;
let eventId: string;

async function seedEvent(name = 'Test Concert') {
  await t.asAdmin();
  const row = await t.one<{ id: string }>(
    `insert into public.events (provider, external_id, name, latitude, longitude)
     values ('test', $1, $2, 40.75, -73.99) returning id`,
    [crypto.randomUUID(), name],
  );
  return row.id;
}

async function mapOf(user: string) {
  await t.asAdmin();
  return (await t.one<{ id: string }>(`select id from public.maps where owner_id = $1`, [user])).id;
}

async function makeGroup(user: string, name: string, color = '#ff0000') {
  await t.as(user);
  return (await t.one<{ id: string }>(
    `insert into public.groups (name, color) values ($1, $2) returning id`, [name, color])).id;
}

async function makeFriends(a: string, b: string) {
  await t.as(a);
  const { send_friend_request: id } = await t.one<{ send_friend_request: string }>(
    `select public.send_friend_request($1)`, [b]);
  await t.as(b);
  await t.query(`select public.respond_friend_request($1, true)`, [id]);
}

beforeEach(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice');
  bob = await t.createUser('bob');
  carol = await t.createUser('carol');
  aliceMap = await mapOf(alice);
  eventId = await seedEvent();
});

describe('Discover isolation', () => {
  it('anonymous users can read public events and nothing private', async () => {
    const g = await makeGroup(alice, 'Concerts');
    await t.as(alice);
    await t.query(`select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [g]]);

    await t.asAnon();
    expect((await t.query(`select id from public.events`)).length).toBe(1);
    for (const table of ['maps', 'pins', 'groups', 'pin_groups', 'profiles', 'pin_images', 'shared_pins', 'collab_maps']) {
      const msg = await t.fails(`select * from public.${table}`);
      expect(msg).toMatch(/permission denied/);
    }
  });

  it('clients cannot write events (only the service role can)', async () => {
    await t.as(alice);
    expect(await t.fails(
      `insert into public.events (provider, external_id, name) values ('x','y','Fake')`,
    )).toMatch(/permission denied/);
    expect(await t.fails(`update public.events set name = 'hacked'`)).toMatch(/permission denied/);
    await t.asAnon();
    expect(await t.fails(`delete from public.events`)).toMatch(/permission denied/);
  });
});

describe('personal maps, pins and groups', () => {
  it('are invisible to other users', async () => {
    const g = await makeGroup(alice, 'Secret');
    await t.as(alice);
    await t.query(
      `select public.create_custom_pin($1, 'Hideout', 'private note', 51.5, -0.12, null, $2)`,
      [aliceMap, [g]],
    );
    await t.as(bob);
    expect(await t.query(`select * from public.maps where owner_id = $1`, [alice])).toEqual([]);
    expect(await t.query(`select * from public.pins`)).toEqual([]);
    expect(await t.query(`select * from public.groups`)).toEqual([]);
    expect(await t.query(`select * from public.pin_groups`)).toEqual([]);
  });

  it('another user cannot write into, update or delete my map/pins', async () => {
    const g = await makeGroup(alice, 'Mine');
    await t.as(alice);
    const { create_custom_pin: pinId } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Spot', null, 1, 1, null, $2)`, [aliceMap, [g]]);

    await t.as(bob);
    expect(await t.fails(
      `insert into public.pins (map_id, kind, title, latitude, longitude) values ($1, 'custom', 'x', 0, 0)`,
      [aliceMap],
    )).toMatch(/row-level security/);
    // Spoofing owner_id is rejected too.
    expect(await t.fails(
      `insert into public.pins (owner_id, map_id, kind, title, latitude, longitude) values ($1, $2, 'custom', 'x', 0, 0)`,
      [alice, aliceMap],
    )).toMatch(/row-level security/);
    await t.query(`update public.pins set title = 'pwned' where id = $1`, [pinId]);
    await t.query(`delete from public.pins where id = $1`, [pinId]);
    await t.query(`delete from public.maps where id = $1`, [aliceMap]);

    await t.asAdmin();
    const pin = await t.one<{ title: string }>(`select title from public.pins where id = $1`, [pinId]);
    expect(pin.title).toBe('Spot');
    expect((await t.query(`select id from public.maps where id = $1`, [aliceMap])).length).toBe(1);
  });

  it("cannot add another user's private pin to my group (or my pin to theirs)", async () => {
    const aliceGroup = await makeGroup(alice, 'A');
    const bobGroup = await makeGroup(bob, 'B');
    await t.as(alice);
    const { create_custom_pin: alicePin } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Spot', null, 1, 1, null, $2)`, [aliceMap, [aliceGroup]]);

    await t.as(bob);
    expect(await t.fails(
      `insert into public.pin_groups (pin_id, group_id) values ($1, $2)`, [alicePin, bobGroup],
    )).toMatch(/row-level security|same owner/);
    await t.as(alice);
    expect(await t.fails(
      `insert into public.pin_groups (pin_id, group_id) values ($1, $2)`, [alicePin, bobGroup],
    )).toMatch(/row-level security|same owner/);
    // Even the privileged role cannot create a cross-owner membership (trigger).
    await t.asAdmin();
    expect(await t.fails(
      `insert into public.pin_groups (pin_id, group_id, owner_id) values ($1, $2, $3)`,
      [alicePin, bobGroup, alice],
    )).toMatch(/same owner/);
  });

  it('save_event_pin requires a group, never duplicates, and updates memberships', async () => {
    const g1 = await makeGroup(alice, 'One');
    const g2 = await makeGroup(alice, 'Two');
    await t.as(alice);
    expect(await t.fails(`select public.save_event_pin($1, $2, '{}')`, [aliceMap, eventId]))
      .toMatch(/at least one group/);

    const a = await t.one<{ save_event_pin: string }>(
      `select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [g1]]);
    const b = await t.one<{ save_event_pin: string }>(
      `select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [g1, g2]]);
    expect(b.save_event_pin).toBe(a.save_event_pin);
    expect((await t.query(`select id from public.pins`)).length).toBe(1);
    const groups = await t.query<{ group_id: string }>(
      `select group_id from public.pin_groups where pin_id = $1 order by group_id`, [a.save_event_pin]);
    expect(groups.map((r) => r.group_id).sort()).toEqual([g1, g2].sort());

    // Direct duplicate insert is blocked by the unique index.
    expect(await t.fails(
      `insert into public.pins (map_id, kind, event_id) values ($1, 'event', $2)`, [aliceMap, eventId],
    )).toMatch(/duplicate key/);
  });

  it('multiple users saving the same event reference one event row', async () => {
    const ga = await makeGroup(alice, 'G');
    const gb = await makeGroup(bob, 'G');
    const bobMap = await mapOf(bob);
    await t.as(alice);
    await t.query(`select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [ga]]);
    await t.as(bob);
    await t.query(`select public.save_event_pin($1, $2, $3)`, [bobMap, eventId, [gb]]);
    await t.asAdmin();
    expect((await t.query(`select id from public.events`)).length).toBe(1);
    const refs = await t.query(`select event_id from public.pins`);
    expect(refs).toEqual([{ event_id: eventId }, { event_id: eventId }]);
  });

  it('a user cannot save into someone else’s map via the RPC', async () => {
    const g = await makeGroup(bob, 'G');
    await t.as(bob);
    expect(await t.fails(`select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [g]]))
      .toMatch(/row-level security/);
  });

  it('deleting a group removes memberships but never pins', async () => {
    const g1 = await makeGroup(alice, 'One');
    const g2 = await makeGroup(alice, 'Two');
    await t.as(alice);
    const { save_event_pin: pin } = await t.one<{ save_event_pin: string }>(
      `select public.save_event_pin($1, $2, $3)`, [aliceMap, eventId, [g1, g2]]);
    await t.query(`delete from public.groups where id = $1`, [g1]);
    expect((await t.query(`select id from public.pins where id = $1`, [pin])).length).toBe(1);
    expect(await t.query(`select group_id from public.pin_groups`)).toEqual([{ group_id: g2 }]);
  });
});

describe('profiles and friendships', () => {
  it('hides friend_code from everyone (column privilege) and exposes it via RPC to the owner', async () => {
    await t.as(bob);
    expect(await t.fails(`select friend_code from public.profiles where id = $1`, [alice]))
      .toMatch(/permission denied/);
    await t.as(alice);
    const { get_my_friend_code: code } = await t.one<{ get_my_friend_code: string }>(
      `select public.get_my_friend_code()`);
    expect(code).toMatch(/^[0-9a-f]{32}$/);
  });

  it('non-discoverable users are hidden from search and cannot be requested by id', async () => {
    const dave = await t.createUser('dave', { discoverable: false });
    await t.as(alice);
    expect(await t.query(`select id from public.profiles where id = $1`, [dave])).toEqual([]);
    expect(await t.fails(`select public.send_friend_request($1)`, [dave])).toMatch(/not found/);

    // ...but the friend link (code) works.
    await t.asAdmin();
    const { friend_code } = await t.one<{ friend_code: string }>(
      `select friend_code from public.profiles where id = $1`, [dave]);
    await t.as(alice);
    await t.query(`select public.send_friend_request_by_code($1)`, [friend_code]);
    // Pending counterpart can now see dave's public profile.
    expect((await t.query(`select username from public.profiles where id = $1`, [dave]))).toEqual([{ username: 'dave' }]);
  });

  it('enforces the request state machine', async () => {
    await t.as(alice);
    const { send_friend_request: fid } = await t.one<{ send_friend_request: string }>(
      `select public.send_friend_request($1)`, [bob]);
    expect(await t.fails(`select public.send_friend_request($1)`, [bob])).toMatch(/already sent/);
    // Requester cannot accept on behalf of the addressee.
    expect(await t.fails(`select public.respond_friend_request($1, true)`, [fid])).toMatch(/No pending/);
    // A third party cannot see or touch it.
    await t.as(carol);
    expect(await t.query(`select * from public.friendships`)).toEqual([]);
    expect(await t.fails(`select public.respond_friend_request($1, true)`, [fid])).toMatch(/No pending/);
    expect(await t.fails(`select public.remove_friendship($1)`, [fid])).toMatch(/not found/);
    // Direct writes are impossible.
    expect(await t.fails(`update public.friendships set status = 'accepted'`)).toMatch(/permission denied/);

    await t.as(bob);
    await t.query(`select public.respond_friend_request($1, false)`, [fid]);
    await t.as(alice);
    expect((await t.one<{ status: string }>(`select status from public.friendships`)).status).toBe('declined');
    // Can request again after decline; reverse request auto-accepts.
    await t.as(bob);
    await t.query(`select public.send_friend_request($1)`, [alice]);
    await t.as(alice);
    await t.query(`select public.send_friend_request($1)`, [bob]);
    expect((await t.one<{ status: string }>(`select status from public.friendships`)).status).toBe('accepted');
    await t.query(`select public.remove_friendship($1)`, [fid]);
    expect((await t.one<{ status: string }>(`select status from public.friendships`)).status).toBe('revoked');
  });

  it('friendship grants no map or pin access', async () => {
    await makeFriends(alice, bob);
    const g = await makeGroup(alice, 'G');
    await t.as(alice);
    await t.query(`select public.create_custom_pin($1, 'Home', 'my address', 1, 1, null, $2)`, [aliceMap, [g]]);
    await t.as(bob);
    expect(await t.query(`select * from public.pins`)).toEqual([]);
    expect(await t.query(`select * from public.maps where owner_id = $1`, [alice])).toEqual([]);
  });
});

describe('collaboration', () => {
  async function setupCollab() {
    await t.as(alice);
    const { create_collab_map: mapId } = await t.one<{ create_collab_map: string }>(
      `select public.create_collab_map('Trip', null)`);
    const inv = await t.one<{ token: string; invitation_id: string }>(
      `select * from public.create_collab_invitation($1, 'viewer', null, 24, null)`, [mapId]);
    return { mapId, token: inv.token, invitationId: inv.invitation_id };
  }

  it('stores only a hash of invitation tokens', async () => {
    const { token } = await setupCollab();
    await t.asAdmin();
    const rows = await t.query<{ token_hash: string }>(`select token_hash from public.collab_invitations`);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires explicit acceptance and grants exactly the invited role', async () => {
    const { mapId, token } = await setupCollab();
    await t.as(bob);
    expect(await t.query(`select * from public.collab_maps`)).toEqual([]);
    const preview = await t.one<{ status: string; map_name: string }>(
      `select * from public.preview_collab_invitation($1)`, [token]);
    expect(preview).toMatchObject({ status: 'valid', map_name: 'Trip' });
    // Preview alone grants nothing.
    expect(await t.query(`select * from public.collab_maps`)).toEqual([]);
    await t.query(`select public.accept_collab_invitation($1)`, [token]);
    expect((await t.query(`select id from public.collab_maps`)).length).toBe(1);
    expect(await t.one(`select role from public.collab_members where map_id = $1 and user_id = $2`, [mapId, bob]))
      .toEqual({ role: 'viewer' });
    expect((await t.one<{ status: string }>(`select * from public.preview_collab_invitation('nope')`)).status)
      .toBe('invalid');
  });

  it('non-owners cannot invite, change roles, rename, delete, or escalate', async () => {
    const { mapId, token } = await setupCollab();
    await t.as(bob);
    await t.query(`select public.accept_collab_invitation($1)`, [token]);
    expect(await t.fails(`select * from public.create_collab_invitation($1, 'editor', null, 24, null)`, [mapId]))
      .toMatch(/Only the owner/);
    expect(await t.fails(`select public.set_collab_member_role($1, $2, 'editor')`, [mapId, bob]))
      .toMatch(/Only the owner/);
    expect(await t.fails(`update public.collab_members set role = 'owner' where user_id = $1`, [bob]))
      .toMatch(/permission denied/);
    expect(await t.fails(`insert into public.collab_members (map_id, user_id, role) values ($1, $2, 'owner')`, [mapId, carol]))
      .toMatch(/permission denied/);
    await t.query(`update public.collab_maps set name = 'Mine now' where id = $1`, [mapId]);
    await t.query(`delete from public.collab_maps where id = $1`, [mapId]);
    // Cannot remove the owner.
    await t.query(`delete from public.collab_members where user_id = $1`, [alice]);
    await t.asAdmin();
    expect(await t.one(`select name from public.collab_maps where id = $1`, [mapId])).toEqual({ name: 'Trip' });
    expect((await t.query(`select * from public.collab_members`)).length).toBe(2);
  });

  it('honours revocation, expiry, use limits and recipient restrictions', async () => {
    const { mapId, token, invitationId } = await setupCollab();
    await t.as(alice);
    await t.query(`select public.revoke_collab_invitation($1)`, [invitationId]);
    await t.as(bob);
    expect(await t.fails(`select public.accept_collab_invitation($1)`, [token])).toMatch(/revoked/);

    await t.as(alice);
    const once = await t.one<{ token: string }>(
      `select * from public.create_collab_invitation($1, 'viewer', null, 24, 1)`, [mapId]);
    await t.as(bob);
    await t.query(`select public.accept_collab_invitation($1)`, [once.token]);
    await t.as(carol);
    expect(await t.fails(`select public.accept_collab_invitation($1)`, [once.token])).toMatch(/used/);

    await t.as(alice);
    const exp = await t.one<{ token: string; invitation_id: string }>(
      `select * from public.create_collab_invitation($1, 'viewer', null, 1, null)`, [mapId]);
    await t.asAdmin();
    await t.query(`update public.collab_invitations set expires_at = now() - interval '1 minute' where id = $1`, [exp.invitation_id]);
    await t.as(carol);
    expect(await t.fails(`select public.accept_collab_invitation($1)`, [exp.token])).toMatch(/expired/);

    // Recipient-restricted: only friends can be targeted, only they can accept.
    await t.as(alice);
    expect(await t.fails(`select * from public.create_collab_invitation($1, 'editor', $2, 24, null)`, [mapId, carol]))
      .toMatch(/only invite friends/);
    const dave = await t.createUser('dave');
    await makeFriends(alice, dave);
    await t.as(alice);
    const direct = await t.one<{ token: string; invitation_id: string }>(
      `select * from public.create_collab_invitation($1, 'editor', $2, 24, null)`, [mapId, dave]);
    await t.as(carol);
    expect(await t.fails(`select public.accept_collab_invitation($1)`, [direct.token])).toMatch(/wrong_recipient/);
    await t.as(dave);
    const inbox = await t.query(`select * from public.my_pending_invitations()`);
    expect(inbox).toHaveLength(1);
    await t.query(`select public.respond_collab_invitation($1, true)`, [direct.invitation_id]);
    expect(await t.one(`select role from public.collab_members where map_id = $1 and user_id = $2`, [mapId, dave]))
      .toEqual({ role: 'editor' });
  });

  it('sharing creates an independent representation; viewers and strangers are blocked', async () => {
    const { mapId, token } = await setupCollab();
    const g = await makeGroup(alice, 'G');
    await t.as(alice);
    const { create_custom_pin: pinId } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Cafe', 'secret note', 48.85, 2.35, null, $2)`, [aliceMap, [g]]);
    const { share_pin: sharedId } = await t.one<{ share_pin: string }>(
      `select public.share_pin($1, $2, false, true)`, [pinId, mapId]);

    await t.as(bob);
    await t.query(`select public.accept_collab_invitation($1)`, [token]);
    const shared = await t.one<{ title: string; note: string | null }>(`select title, note from public.shared_pins`);
    expect(shared).toEqual({ title: 'Cafe', note: null }); // note NOT shared without opt-in
    expect(await t.query(`select * from public.pins`)).toEqual([]); // original stays private

    // Viewer cannot share; nobody can share a pin they don't own.
    const bobMap = await mapOf(bob);
    const bg = await makeGroup(bob, 'G');
    await t.as(bob);
    const { create_custom_pin: bobPin } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Bob spot', null, 1, 1, null, $2)`, [bobMap, [bg]]);
    expect(await t.fails(`select public.share_pin($1, $2)`, [bobPin, mapId])).toMatch(/editor access/);
    expect(await t.fails(`select public.share_pin($1, $2)`, [pinId, mapId])).toMatch(/Pin not found/);
    // Viewer cannot delete another member's shared pin.
    await t.query(`delete from public.shared_pins where id = $1`, [sharedId]);
    expect((await t.query(`select id from public.shared_pins`)).length).toBe(1);

    // Stranger sees nothing.
    await t.as(carol);
    expect(await t.query(`select * from public.shared_pins`)).toEqual([]);

    // Removing the representation keeps the original.
    await t.as(alice);
    await t.query(`delete from public.shared_pins where id = $1`, [sharedId]);
    expect((await t.query(`select id from public.pins where id = $1`, [pinId])).length).toBe(1);
  });

  it('removed members lose access immediately', async () => {
    const { mapId, token } = await setupCollab();
    await t.as(bob);
    await t.query(`select public.accept_collab_invitation($1)`, [token]);
    await t.as(alice);
    await t.query(`delete from public.collab_members where map_id = $1 and user_id = $2`, [mapId, bob]);
    await t.as(bob);
    expect(await t.query(`select * from public.collab_maps`)).toEqual([]);
    expect(await t.query(`select * from public.shared_pins`)).toEqual([]);
  });
});

describe('pin images and storage', () => {
  async function uploadImage(user: string) {
    await t.as(user);
    const path = `${user}/${crypto.randomUUID()}.webp`;
    await t.query(`insert into storage.objects (bucket_id, name) values ('pin-images', $1)`, [path]);
    const { id } = await t.one<{ id: string }>(
      `insert into public.pin_images (storage_path, mime_type, byte_size, width, height)
       values ($1, 'image/webp', 1000, 256, 256) returning id`, [path]);
    return { path, id };
  }

  it('bucket is private', async () => {
    await t.asAdmin();
    expect(await t.one(`select public from storage.buckets where id = 'pin-images'`)).toEqual({ public: false });
  });

  it('uploads are confined to the owner folder', async () => {
    await t.as(bob);
    expect(await t.fails(
      `insert into storage.objects (bucket_id, name) values ('pin-images', $1)`, [`${alice}/evil.webp`],
    )).toMatch(/row-level security/);
    expect(await t.fails(
      `insert into public.pin_images (owner_id, storage_path, mime_type, byte_size) values ($1, $2, 'image/png', 10)`,
      [bob, `${alice}/x.png`],
    )).toMatch(/check constraint/);
  });

  it('private images are unreadable to others until shared, then readable only by members', async () => {
    const img = await uploadImage(alice);
    const g = await makeGroup(alice, 'G');
    await t.as(alice);
    const { create_custom_pin: pinId } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Pic', null, 1, 1, null, $2)`, [aliceMap, [g]]);
    await t.query(`update public.pins set image_id = $1 where id = $2`, [img.id, pinId]);

    // Bob can't attach Alice's image to his own pin either.
    const bobMap = await mapOf(bob);
    const bg = await makeGroup(bob, 'G');
    await t.as(bob);
    const { create_custom_pin: bobPin } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'B', null, 1, 1, null, $2)`, [bobMap, [bg]]);
    expect(await t.fails(`update public.pins set image_id = $1 where id = $2`, [img.id, bobPin]))
      .toMatch(/row-level security/);
    expect(await t.query(`select * from storage.objects where name = $1`, [img.path])).toEqual([]);
    expect(await t.query(`select * from public.pin_images`)).toEqual([]);

    await t.as(alice);
    const { create_collab_map: mapId } = await t.one<{ create_collab_map: string }>(
      `select public.create_collab_map('Shared', null)`);
    const inv = await t.one<{ token: string }>(
      `select * from public.create_collab_invitation($1, 'viewer', null, 24, null)`, [mapId]);
    await t.query(`select public.share_pin($1, $2, false, true)`, [pinId, mapId]);

    await t.as(bob);
    await t.query(`select public.accept_collab_invitation($1)`, [inv.token]);
    expect((await t.query(`select * from storage.objects where name = $1`, [img.path])).length).toBe(1);
    expect((await t.query(`select id from public.pin_images`)).length).toBe(1);
    await t.as(carol);
    expect(await t.query(`select * from storage.objects where name = $1`, [img.path])).toEqual([]);
  });

  it('an image still in use cannot be deleted (row or file)', async () => {
    const img = await uploadImage(alice);
    const g = await makeGroup(alice, 'G');
    await t.as(alice);
    const { create_custom_pin: pinId } = await t.one<{ create_custom_pin: string }>(
      `select public.create_custom_pin($1, 'Pic', null, 1, 1, null, $2)`, [aliceMap, [g]]);
    await t.query(`update public.pins set image_id = $1 where id = $2`, [img.id, pinId]);
    expect(await t.fails(`delete from public.pin_images where id = $1`, [img.id])).toMatch(/foreign key/);
    await t.query(`delete from storage.objects where name = $1`, [img.path]);
    expect((await t.query(`select * from storage.objects where name = $1`, [img.path])).length).toBe(1);

    // Shared representation keeps it alive even after the pin stops using it.
    const { create_collab_map: mapId } = await t.one<{ create_collab_map: string }>(
      `select public.create_collab_map('S', null)`);
    await t.query(`select public.share_pin($1, $2, false, true)`, [pinId, mapId]);
    await t.query(`update public.pins set image_id = null where id = $1`, [pinId]);
    expect(await t.fails(`delete from public.pin_images where id = $1`, [img.id])).toMatch(/foreign key/);

    // Once unreferenced: row then file can be removed.
    await t.query(`delete from public.shared_pins where collab_map_id = $1`, [mapId]);
    await t.query(`delete from public.pin_images where id = $1`, [img.id]);
    await t.query(`delete from storage.objects where name = $1`, [img.path]);
    expect(await t.query(`select * from storage.objects where name = $1`, [img.path])).toEqual([]);
  });
});
