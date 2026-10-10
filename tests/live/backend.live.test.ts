/**
 * LIVE backend integration + security tests against the linked Supabase
 * project, using three dedicated test accounts (A = owner, B = friend /
 * collaborator, C = stranger / collaborator). Everything here goes through the
 * real Auth, PostgREST (RLS), RPCs, Storage and Edge Function — the same paths
 * a malicious client with a valid session could use.
 *
 * Every object created is tagged with a per-run suffix and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, LIVE, liveConfigured, signedIn, TINY_PNG } from './env';

const RUN = Date.now().toString(36);
const BUCKET = 'pin-images';

let A: SupabaseClient, B: SupabaseClient, C: SupabaseClient;
let aId: string, bId: string, cId: string;
let aDefaultMap: string;
let testEventId: string;

// Cleanup registry
const cleanup: (() => PromiseLike<unknown>)[] = [];

describe.skipIf(!liveConfigured)('live backend', () => {
  beforeAll(async () => {
    ({ client: A, userId: aId } = await signedIn('A'));
    ({ client: B, userId: bId } = await signedIn('B'));
    ({ client: C, userId: cId } = await signedIn('C'));
    const ev = await A.from('events').select('id').eq('provider', 'atlas-live-test').eq('external_id', 'live-test-1').single();
    if (ev.error) throw new Error('Live test event missing — run scripts/live/provision-test-users.mjs');
    testEventId = ev.data.id;
  });

  afterAll(async () => {
    for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => undefined);
  });

  // ---------------------------------------------------------------------------
  describe('authentication and profile bootstrap', () => {
    it('rejects a wrong password', async () => {
      const { error } = await anonClient().auth.signInWithPassword({ email: LIVE.users[0].email, password: 'definitely-wrong' });
      expect(error).not.toBeNull();
    });

    it('signed-in user has a profile and a default private map', async () => {
      const prof = await A.from('profiles').select('id, username, discoverable').eq('id', aId).single();
      expect(prof.error).toBeNull();
      expect(prof.data!.username).toBe('atlas_live_a');
      const maps = await A.from('maps').select('id, name').order('created_at');
      expect(maps.error).toBeNull();
      expect(maps.data!.length).toBeGreaterThanOrEqual(1);
      aDefaultMap = maps.data![0].id;
    });

    it('session can be refreshed and signing out drops access', async () => {
      const { client } = await signedIn('A');
      const refreshed = await client.auth.refreshSession();
      expect(refreshed.error).toBeNull();
      expect((await client.from('maps').select('id')).data!.length).toBeGreaterThan(0);
      await client.auth.signOut();
      const after = await client.from('maps').select('id');
      expect(after.error?.message ?? '').toMatch(/permission denied/);
    });

    it('anonymous visitors can read public events but not private tables', async () => {
      const anon = anonClient();
      expect((await anon.from('events').select('id').limit(1)).error).toBeNull();
      for (const t of ['maps', 'pins', 'groups', 'pin_groups', 'profiles', 'pin_images', 'shared_pins', 'collab_maps', 'friendships']) {
        const r = await anon.from(t).select('*').limit(1);
        expect(r.error?.message, t).toMatch(/permission denied/);
      }
    });

    it('anonymous callers cannot execute any RPC; leaky helpers are not callable at all', async () => {
      const anon = anonClient();
      for (const fn of ['are_friends', 'collab_role_of', 'save_event_pin', 'get_my_friend_code', 'my_orphaned_pin_images']) {
        const r = await anon.rpc(fn as never, {} as never);
        expect(r.error?.message ?? '', fn).toMatch(/permission denied|Could not find/);
      }
      const r = await B.rpc('collab_role_of' as never, { p_map_id: crypto.randomUUID(), p_user_id: aId } as never);
      expect(r.error?.message).toMatch(/permission denied/);
      expect((await B.rpc('are_friends' as never, { p_a: aId, p_b: bId } as never)).error?.message).toMatch(/permission denied/);
    });

    it('friend_code is not readable by other users (column privilege)', async () => {
      const r = await B.from('profiles').select('friend_code').eq('id', aId);
      expect(r.error?.message).toMatch(/permission denied/);
      const own = await A.rpc('get_my_friend_code');
      expect(own.error).toBeNull();
      expect(own.data).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('maps, groups and pins (owner A)', () => {
    let mapId: string;
    let map2Id: string;
    let g1: string;
    let g2: string;
    let customPin: string;
    let eventPin: string;

    it('creates, renames and lists maps', async () => {
      const m = await A.from('maps').insert({ name: `Live ${RUN}` }).select('id').single();
      expect(m.error).toBeNull();
      mapId = m.data!.id;
      cleanup.push(() => A.from('maps').delete().eq('id', mapId));
      const m2 = await A.from('maps').insert({ name: `Live ${RUN} second` }).select('id').single();
      map2Id = m2.data!.id;
      cleanup.push(() => A.from('maps').delete().eq('id', map2Id));
      const upd = await A.from('maps').update({ name: `Live ${RUN} renamed` }).eq('id', mapId).select('name').single();
      expect(upd.data!.name).toBe(`Live ${RUN} renamed`);
    });

    it('creates groups and enforces unique names per owner', async () => {
      const a = await A.from('groups').insert({ name: `Food ${RUN}`, color: '#c2410c' }).select('id').single();
      const b = await A.from('groups').insert({ name: `Music ${RUN}`, color: '#2f5bea' }).select('id').single();
      g1 = a.data!.id;
      g2 = b.data!.id;
      cleanup.push(() => A.from('groups').delete().in('id', [g1, g2]));
      const dup = await A.from('groups').insert({ name: `food ${RUN}`, color: '#000000' });
      expect(dup.error?.code).toBe('23505');
    });

    it('requires a group when saving and never duplicates a saved event', async () => {
      const none = await A.rpc('save_event_pin', { p_map_id: mapId, p_event_id: testEventId, p_group_ids: [] });
      expect(none.error?.message).toMatch(/at least one group/i);
      const first = await A.rpc('save_event_pin', { p_map_id: mapId, p_event_id: testEventId, p_group_ids: [g1] });
      expect(first.error).toBeNull();
      const second = await A.rpc('save_event_pin', { p_map_id: mapId, p_event_id: testEventId, p_group_ids: [g1, g2] });
      expect(second.data).toBe(first.data);
      eventPin = first.data as string;
      const pins = await A.from('pins').select('id').eq('map_id', mapId).eq('event_id', testEventId);
      expect(pins.data).toHaveLength(1);
      const groups = await A.from('pin_groups').select('group_id').eq('pin_id', eventPin);
      expect(groups.data!.map((g) => g.group_id).sort()).toEqual([g1, g2].sort());
    });

    it('creates, edits and moves a custom pin (coordinates and map)', async () => {
      const c = await A.rpc('create_custom_pin', {
        p_map_id: mapId, p_title: `Cafe ${RUN}`, p_note: 'private note', p_latitude: 40.7, p_longitude: -74,
        p_address: '', p_group_ids: [g2],
      });
      expect(c.error).toBeNull();
      customPin = c.data as string;
      const moved = await A.from('pins').update({ latitude: 40.71, longitude: -74.01, note: 'edited' }).eq('id', customPin).select('latitude, note').single();
      expect(moved.data).toEqual({ latitude: 40.71, note: 'edited' });
      const toMap2 = await A.from('pins').update({ map_id: map2Id }).eq('id', customPin).select('map_id').single();
      expect(toMap2.data!.map_id).toBe(map2Id);
      // Memberships survive the move.
      expect((await A.from('pin_groups').select('group_id').eq('pin_id', customPin)).data).toEqual([{ group_id: g2 }]);
    });

    it('deleting a group keeps its pins', async () => {
      const tmp = await A.from('groups').insert({ name: `Tmp ${RUN}`, color: '#525252' }).select('id').single();
      await A.rpc('set_pin_groups', { p_pin_id: customPin, p_group_ids: [g2, tmp.data!.id] });
      await A.from('groups').delete().eq('id', tmp.data!.id);
      expect((await A.from('pins').select('id').eq('id', customPin)).data).toHaveLength(1);
      expect((await A.from('pin_groups').select('group_id').eq('pin_id', customPin)).data).toEqual([{ group_id: g2 }]);
    });

    it('another user cannot read, modify, or attach to A\'s private data by ID', async () => {
      // Reads by guessed ID return nothing.
      expect((await B.from('maps').select('*').eq('id', mapId)).data).toEqual([]);
      expect((await B.from('pins').select('*').eq('id', customPin)).data).toEqual([]);
      expect((await B.from('groups').select('*').eq('id', g1)).data).toEqual([]);
      expect((await B.from('pin_groups').select('*').eq('pin_id', customPin)).data).toEqual([]);
      // Writes affect zero rows / are rejected.
      expect((await B.from('pins').update({ note: 'pwned' }).eq('id', customPin).select('id')).data).toEqual([]);
      expect((await B.from('pins').delete().eq('id', customPin).select('id')).data).toEqual([]);
      expect((await B.from('maps').update({ name: 'pwned' }).eq('id', mapId).select('id')).data).toEqual([]);
      const intoA = await B.from('pins').insert({ map_id: mapId, kind: 'custom', title: 'x', latitude: 0, longitude: 0 });
      expect(intoA.error?.message).toMatch(/row-level security/);
      const spoof = await B.from('pins').insert({ owner_id: aId, map_id: mapId, kind: 'custom', title: 'x', latitude: 0, longitude: 0 });
      expect(spoof.error).not.toBeNull();
      // Cannot put A's pin into B's group, nor use A's RPC paths.
      const bg = await B.from('groups').insert({ name: `B ${RUN}`, color: '#000000' }).select('id').single();
      cleanup.push(() => B.from('groups').delete().eq('id', bg.data!.id));
      const cross = await B.from('pin_groups').insert({ pin_id: customPin, group_id: bg.data!.id });
      expect(cross.error).not.toBeNull();
      expect((await B.rpc('set_pin_groups', { p_pin_id: customPin, p_group_ids: [bg.data!.id] })).error?.message).toMatch(/not found/i);
      expect((await B.rpc('save_event_pin', { p_map_id: mapId, p_event_id: testEventId, p_group_ids: [bg.data!.id] })).error).not.toBeNull();
      // A's data unchanged.
      expect((await A.from('pins').select('note').eq('id', customPin).single()).data!.note).toBe('edited');
    });

    it('clients cannot write public events', async () => {
      const r = await A.from('events').insert({ provider: 'x', external_id: RUN, name: 'Fake' });
      expect(r.error?.message).toMatch(/permission denied/);
      const u = await A.from('events').update({ name: 'hacked' }).eq('id', testEventId);
      expect(u.error?.message).toMatch(/permission denied/);
    });

    it('deletes a pin', async () => {
      const d = await A.from('pins').delete().eq('id', eventPin).select('id');
      expect(d.data).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('friends', () => {
    let friendshipId: string;
    it('request → accept, and friendship grants no map access', async () => {
      // Reset any leftover relationship from earlier runs.
      const prior = await A.from('friendships').select('id, status').or(`requester_id.eq.${bId},addressee_id.eq.${bId}`);
      for (const f of prior.data ?? []) if (f.status === 'accepted') await A.rpc('remove_friendship', { p_friendship_id: f.id });

      const req = await A.rpc('send_friend_request', { p_target: bId });
      expect(req.error).toBeNull();
      friendshipId = req.data as string;
      // Requester cannot accept on the addressee's behalf; a stranger cannot respond.
      expect((await A.rpc('respond_friend_request', { p_friendship_id: friendshipId, p_accept: true })).error).not.toBeNull();
      expect((await C.rpc('respond_friend_request', { p_friendship_id: friendshipId, p_accept: true })).error).not.toBeNull();
      expect((await C.from('friendships').select('*').eq('id', friendshipId)).data).toEqual([]);
      // Direct writes impossible.
      expect((await B.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)).error?.message).toMatch(/permission denied/);

      expect((await B.rpc('respond_friend_request', { p_friendship_id: friendshipId, p_accept: true })).error).toBeNull();
      const f = await A.from('friendships').select('status').eq('id', friendshipId).single();
      expect(f.data!.status).toBe('accepted');

      expect((await B.from('pins').select('id').eq('owner_id', aId)).data).toEqual([]);
      expect((await B.from('maps').select('id').eq('owner_id', aId)).data).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('images, collaboration and revocation', () => {
    let imgPath: string;
    let imgId: string;
    let pinWithImage: string;
    let collabId: string;
    let viewerToken: string;
    let viewerInviteId: string;
    let shareId: string;

    it('uploads to own folder only; other users cannot read or write it', async () => {
      imgPath = `${aId}/${crypto.randomUUID()}.png`;
      const up = await A.storage.from(BUCKET).upload(imgPath, new Blob([TINY_PNG], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
      expect(up.error).toBeNull();
      cleanup.push(() => A.storage.from(BUCKET).remove([imgPath]));
      const row = await A.from('pin_images').insert({ storage_path: imgPath, mime_type: 'image/png', byte_size: TINY_PNG.length, width: 1, height: 1 }).select('id').single();
      expect(row.error).toBeNull();
      imgId = row.data!.id;
      cleanup.push(() => A.from('pin_images').delete().eq('id', imgId));

      // Owner can get a working signed URL.
      const signed = await A.storage.from(BUCKET).createSignedUrl(imgPath, 60);
      expect(signed.error).toBeNull();
      const res = await fetch(signed.data!.signedUrl);
      expect(res.status).toBe(200);

      // Other users: no signed URL, no download, no upload/overwrite into A's folder.
      expect((await C.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).not.toBeNull();
      expect((await C.storage.from(BUCKET).download(imgPath)).error).not.toBeNull();
      expect((await C.storage.from(BUCKET).upload(`${aId}/evil.png`, new Blob([TINY_PNG], { type: 'image/png' }), { contentType: 'image/png' })).error).not.toBeNull();
      expect((await A.storage.from(BUCKET).upload(imgPath, new Blob([TINY_PNG], { type: 'image/png' }), { contentType: 'image/png', upsert: true })).error).not.toBeNull();
      // Public URL path does not work for a private bucket.
      const pub = A.storage.from(BUCKET).getPublicUrl(imgPath).data.publicUrl;
      expect((await fetch(pub)).status).toBeGreaterThanOrEqual(400);
      // Disallowed MIME type is rejected by the bucket.
      const bad = await A.storage.from(BUCKET).upload(`${aId}/${crypto.randomUUID()}.svg`, new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' });
      expect(bad.error).not.toBeNull();
      // B cannot attach A's image to B's pin.
      expect((await C.from('pin_images').select('id').eq('id', imgId)).data).toEqual([]);
    });

    it('owner sets the image as a pin marker; an in-use image cannot be deleted', async () => {
      const g = await A.from('groups').insert({ name: `Img ${RUN}`, color: '#0e7490' }).select('id').single();
      cleanup.push(() => A.from('groups').delete().eq('id', g.data!.id));
      const p = await A.rpc('create_custom_pin', {
        p_map_id: aDefaultMap, p_title: `Picture ${RUN}`, p_note: 'secret note', p_latitude: 48.85, p_longitude: 2.35, p_address: '', p_group_ids: [g.data!.id],
      });
      pinWithImage = p.data as string;
      cleanup.push(() => A.from('pins').delete().eq('id', pinWithImage));
      const upd = await A.from('pins').update({ image_id: imgId, image_mask: 'rounded' }).eq('id', pinWithImage).select('image_id').single();
      expect(upd.data!.image_id).toBe(imgId);

      const del = await A.from('pin_images').delete().eq('id', imgId);
      expect(del.error?.code).toBe('23503');
      await A.storage.from(BUCKET).remove([imgPath]);
      expect((await A.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).toBeNull(); // still there
    });

    it('owner creates a collaboration map and a hashed, explicit-accept viewer invitation', async () => {
      const c = await A.rpc('create_collab_map', { p_name: `Trip ${RUN}`, p_description: null });
      expect(c.error).toBeNull();
      collabId = c.data as string;
      cleanup.push(() => A.from('collab_maps').delete().eq('id', collabId));
      const inv = await A.rpc('create_collab_invitation', { p_map_id: collabId, p_role: 'viewer', p_recipient_id: null, p_expires_in_hours: 24, p_max_uses: null });
      expect(inv.error).toBeNull();
      viewerToken = inv.data[0].token;
      viewerInviteId = inv.data[0].invitation_id;
      expect(viewerToken).toMatch(/^[0-9a-f]{64}$/);
      const stored = await A.from('collab_invitations').select('*').eq('id', viewerInviteId).single();
      expect(JSON.stringify(stored.data)).not.toContain(viewerToken); // only the hash is stored

      // Before accepting, C sees nothing; preview reveals only the invite summary.
      expect((await C.from('collab_maps').select('id').eq('id', collabId)).data).toEqual([]);
      const pv = await C.rpc('preview_collab_invitation', { p_token: viewerToken });
      expect(pv.data[0]).toMatchObject({ status: 'valid', role: 'viewer' });
      expect((await C.rpc('preview_collab_invitation', { p_token: 'f'.repeat(64) })).data[0].status).toBe('invalid');
      expect((await C.from('collab_maps').select('id').eq('id', collabId)).data).toEqual([]);
      const acc = await C.rpc('accept_collab_invitation', { p_token: viewerToken });
      expect(acc.error).toBeNull();
      expect((await C.from('collab_members').select('role').eq('map_id', collabId).eq('user_id', cId).single()).data!.role).toBe('viewer');
    });

    it('sharing creates an independent copy; note is opt-in; image readable by members only', async () => {
      const s = await A.rpc('share_pin', { p_pin_id: pinWithImage, p_collab_map_id: collabId, p_include_note: false, p_include_appearance: true });
      expect(s.error).toBeNull();
      shareId = s.data as string;
      const seen = await C.from('shared_pins').select('title, note, image_id').eq('id', shareId).single();
      expect(seen.data).toMatchObject({ title: `Picture ${RUN}`, note: null, image_id: imgId });
      expect((await C.from('pins').select('id').eq('id', pinWithImage)).data).toEqual([]); // original stays private
      // Member C can now load the shared image; non-member B cannot.
      const cs = await C.storage.from(BUCKET).createSignedUrl(imgPath, 60);
      expect(cs.error).toBeNull();
      expect((await fetch(cs.data!.signedUrl)).status).toBe(200);
      expect((await B.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).not.toBeNull();
      expect((await B.from('shared_pins').select('id').eq('id', shareId)).data).toEqual([]);
    });

    it('viewer cannot perform editor or owner actions', async () => {
      const cg = await C.from('groups').insert({ name: `C ${RUN}`, color: '#000000' }).select('id').single();
      cleanup.push(() => C.from('groups').delete().eq('id', cg.data!.id));
      const cMap = (await C.from('maps').select('id').limit(1).single()).data!.id;
      const cp = await C.rpc('create_custom_pin', { p_map_id: cMap, p_title: `C pin ${RUN}`, p_note: '', p_latitude: 1, p_longitude: 1, p_address: '', p_group_ids: [cg.data!.id] });
      cleanup.push(() => C.from('pins').delete().eq('id', cp.data));
      expect((await C.rpc('share_pin', { p_pin_id: cp.data, p_collab_map_id: collabId })).error?.message).toMatch(/editor access/);
      expect((await C.rpc('create_collab_invitation', { p_map_id: collabId, p_role: 'editor', p_recipient_id: null, p_expires_in_hours: 24, p_max_uses: null })).error?.message).toMatch(/Only the owner/);
      expect((await C.rpc('set_collab_member_role', { p_map_id: collabId, p_user_id: cId, p_role: 'editor' })).error?.message).toMatch(/Only the owner/);
      expect((await C.from('collab_members').update({ role: 'owner' }).eq('user_id', cId)).error?.message).toMatch(/permission denied/);
      expect((await C.from('collab_maps').update({ name: 'mine' }).eq('id', collabId).select('id')).data).toEqual([]);
      expect((await C.from('shared_pins').delete().eq('id', shareId).select('id')).data).toEqual([]);
      expect((await C.from('collab_maps').delete().eq('id', collabId).select('id')).data).toEqual([]);
      expect((await C.from('collab_invitations').select('id').eq('map_id', collabId)).data).toEqual([]);
    });

    it('editor can share own pins but cannot perform owner-only actions', async () => {
      expect((await A.rpc('set_collab_member_role', { p_map_id: collabId, p_user_id: cId, p_role: 'editor' })).error).toBeNull();
      const cPin = (await C.from('pins').select('id').eq('title', `C pin ${RUN}`).single()).data!.id;
      const sh = await C.rpc('share_pin', { p_pin_id: cPin, p_collab_map_id: collabId, p_include_note: false, p_include_appearance: true });
      expect(sh.error).toBeNull();
      // Editor still cannot share someone else's pin or act as owner.
      expect((await C.rpc('share_pin', { p_pin_id: pinWithImage, p_collab_map_id: collabId })).error?.message).toMatch(/not found/i);
      expect((await C.rpc('create_collab_invitation', { p_map_id: collabId, p_role: 'viewer', p_recipient_id: null, p_expires_in_hours: 24, p_max_uses: null })).error?.message).toMatch(/Only the owner/);
      expect((await C.rpc('revoke_collab_invitation', { p_invitation_id: viewerInviteId })).error).not.toBeNull();
      expect((await C.from('collab_members').delete().eq('map_id', collabId).eq('user_id', aId).select('user_id')).data).toEqual([]);
      expect((await C.from('shared_pins').delete().eq('id', shareId).select('id')).data).toEqual([]); // A's share
    });

    it('recipient-restricted invitations only work for that friend', async () => {
      const inv = await A.rpc('create_collab_invitation', { p_map_id: collabId, p_role: 'viewer', p_recipient_id: bId, p_expires_in_hours: 24, p_max_uses: null });
      expect(inv.error).toBeNull();
      const tok = inv.data[0].token;
      // Stranger-targeted invitations are refused (C is not A's friend).
      expect((await A.rpc('create_collab_invitation', { p_map_id: collabId, p_role: 'viewer', p_recipient_id: cId, p_expires_in_hours: 24, p_max_uses: null })).error?.message).toMatch(/only invite friends|already a member/);
      expect((await B.rpc('my_pending_invitations')).data.some((i: { map_id: string }) => i.map_id === collabId)).toBe(true);
      const { client: other } = await signedIn('C');
      expect((await other.rpc('accept_collab_invitation', { p_token: tok })).error?.message).toMatch(/already_member|wrong_recipient/);
      expect((await B.rpc('respond_collab_invitation', { p_invitation_id: inv.data[0].invitation_id, p_accept: false })).error).toBeNull();
      expect((await B.from('collab_maps').select('id').eq('id', collabId)).data).toEqual([]);
    });

    it('revoked invitations cannot be used', async () => {
      expect((await A.rpc('revoke_collab_invitation', { p_invitation_id: viewerInviteId })).error).toBeNull();
      expect((await B.rpc('accept_collab_invitation', { p_token: viewerToken })).error?.message).toMatch(/revoked/);
    });

    it('removing a collaborator revokes access immediately (data and images)', async () => {
      expect((await C.from('shared_pins').select('id').eq('collab_map_id', collabId)).data!.length).toBeGreaterThan(0);
      const rm = await A.from('collab_members').delete().eq('map_id', collabId).eq('user_id', cId).select('user_id');
      expect(rm.data).toHaveLength(1);
      expect((await C.from('collab_maps').select('id').eq('id', collabId)).data).toEqual([]);
      expect((await C.from('shared_pins').select('id').eq('collab_map_id', collabId).neq('shared_by', cId)).data).toEqual([]);
      expect((await C.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).not.toBeNull();
    });

    it('removing a shared copy keeps the original pin and its image', async () => {
      expect((await A.from('shared_pins').delete().eq('id', shareId).select('id')).data).toHaveLength(1);
      const orig = await A.from('pins').select('id, image_id, note').eq('id', pinWithImage).single();
      expect(orig.data).toMatchObject({ image_id: imgId, note: 'secret note' });
      expect((await A.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).toBeNull();
    });

    it('orphan cleanup lists only the caller\'s own unreferenced files', async () => {
      const orphan = `${aId}/${crypto.randomUUID()}.png`;
      expect((await A.storage.from(BUCKET).upload(orphan, new Blob([TINY_PNG], { type: 'image/png' }), { contentType: 'image/png' })).error).toBeNull();
      cleanup.push(() => A.storage.from(BUCKET).remove([orphan]));
      const mine = await A.rpc('my_orphaned_pin_images', { p_min_age: '0 seconds' });
      expect(mine.error).toBeNull();
      const names = (mine.data as { name: string }[]).map((r) => r.name);
      expect(names).toContain(orphan);
      expect(names).not.toContain(imgPath); // referenced by a pin -> never listed
      // Default min age (1 hour) hides fresh uploads.
      expect(((await A.rpc('my_orphaned_pin_images')).data as { name: string }[]).map((r) => r.name)).not.toContain(orphan);
      // Other users never see or delete it; the admin report is service-only.
      expect(((await C.rpc('my_orphaned_pin_images', { p_min_age: '0 seconds' })).data as { name: string }[]).map((r) => r.name)).not.toContain(orphan);
      expect((await C.rpc('orphaned_pin_image_report')).error).not.toBeNull();
      await C.storage.from(BUCKET).remove([orphan]);
      expect((await A.storage.from(BUCKET).createSignedUrl(orphan, 60)).error).toBeNull();
      // The owner can remove it.
      const rm = await A.storage.from(BUCKET).remove([orphan]);
      expect(rm.data).toHaveLength(1);
    });

    it('once unreferenced, the image row and file can be deleted by the owner', async () => {
      await A.from('pins').update({ image_id: null }).eq('id', pinWithImage);
      expect((await A.from('pin_images').delete().eq('id', imgId).select('id')).data).toHaveLength(1);
      const rm = await A.storage.from(BUCKET).remove([imgPath]);
      expect(rm.error).toBeNull();
      expect((await A.storage.from(BUCKET).createSignedUrl(imgPath, 60)).error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  describe('discover-events Edge Function', () => {
    const invoke = (body: unknown) => fetch(`${LIVE.url}/functions/v1/discover-events`, {
      method: 'POST',
      headers: { apikey: LIVE.anonKey, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

    it('validates input', async () => {
      expect((await invoke({ bbox: { west: 'x' } })).status).toBe(400);
      expect((await invoke('not json')).status).toBe(400);
      expect((await invoke({ bbox: {}, pad: 'x'.repeat(5000) })).status).toBe(413);
    });

    it('returns labelled results without leaking the key', async () => {
      const res = await invoke({ bbox: { west: -74.05, south: 40.68, east: -73.9, north: 40.8 } });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/apikey=/i);
      const body = JSON.parse(text);
      expect(['ticketmaster', 'cache']).toContain(body.source);
      expect(typeof body.stale).toBe('boolean');
      for (const e of body.events) {
        expect(e.provider).toBe('ticketmaster');
        expect(e.is_dev_fixture).toBe(false);
        expect(e.latitude).toBeGreaterThanOrEqual(40.68);
        expect(e.latitude).toBeLessThanOrEqual(40.8);
      }
      // Record provenance in the test output for the report.
      console.info(`[live] discover-events: source=${body.source} fetched=${body.fetched} stale=${body.stale} warning=${body.warning ?? 'none'} events=${body.events.length}`);
    });
  });
});
