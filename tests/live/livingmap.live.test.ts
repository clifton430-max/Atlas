/**
 * LIVE: living-map server paths against the linked project.
 *   - place-details Edge Function (real OSM + Wikimedia data, validation)
 *   - save_place_pin / attendance (owner, RLS)
 *   - add_to_collab role boundaries (owner, viewer, stranger)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIVE, liveConfigured, signedIn } from './env';

const RUN = Date.now().toString(36);
const cleanup: (() => PromiseLike<unknown>)[] = [];
let A: SupabaseClient, B: SupabaseClient, C: SupabaseClient;
let eventId: string;

const placeDetails = (body: unknown) => fetch(`${LIVE.url}/functions/v1/place-details`, {
  method: 'POST', headers: { apikey: LIVE.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe.skipIf(!liveConfigured)('living map (live)', () => {
  beforeAll(async () => {
    ({ client: A } = await signedIn('A'));
    ({ client: B } = await signedIn('B'));
    ({ client: C } = await signedIn('C'));
    eventId = (await A.from('events').select('id').eq('provider', 'atlas-live-test').single()).data!.id;
  });
  afterAll(async () => { for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => undefined); });

  it('place-details returns verified OSM data and an attributed Commons image; rejects bad refs', async () => {
    const res = await placeDetails({ ref: 'osm:way/34633854' }); // Empire State Building
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/service_role|apikey/i);
    const d = JSON.parse(text);
    expect(d.name).toBe('Empire State Building');
    expect(d.address).toMatch(/350/);
    expect(d.website).toMatch(/^https:\/\//);
    expect(d).not.toHaveProperty('_tags');
    expect(d).not.toHaveProperty('_diag');
    if (d.image) {
      expect(d.image.thumbUrl).toMatch(/^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//);
      expect(d.image.license).toBeTruthy();
      expect(d.image.sourcePage).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
    console.info(`[live] place-details ESB image=${d.image ? `${d.image.license} by ${d.image.artist}` : 'none'} children=${d.childrenStatus}`);
    expect((await placeDetails({ ref: 'osm:way/abc' })).status).toBe(400);
    expect((await placeDetails({ ref: 'https://evil.example' })).status).toBe(400);
  });

  it('save_place_pin: group required, deduplicated per map, private to the owner', async () => {
    const map = (await A.from('maps').select('id').order('created_at').limit(1).single()).data!.id;
    const g = (await A.from('groups').insert({ name: `Places ${RUN}`, color: '#c2410c', icon: 'utensils' }).select('id').single()).data!.id;
    cleanup.push(() => A.from('groups').delete().eq('id', g));
    const args = { p_map_id: map, p_place_ref: 'osm:way/34633854', p_title: 'Empire State Building', p_latitude: 40.7484, p_longitude: -73.9857, p_address: '350 5th Avenue' };
    expect((await A.rpc('save_place_pin', { ...args, p_group_ids: [] })).error?.message).toMatch(/at least one group/i);
    const first = await A.rpc('save_place_pin', { ...args, p_group_ids: [g] });
    expect(first.error).toBeNull();
    cleanup.push(() => A.from('pins').delete().eq('id', first.data as string));
    const second = await A.rpc('save_place_pin', { ...args, p_group_ids: [g] });
    expect(second.data).toBe(first.data);
    expect((await A.from('pins').select('place_ref').eq('id', first.data as string).single()).data!.place_ref).toBe('osm:way/34633854');
    expect((await B.from('pins').select('id').eq('id', first.data as string)).data).toEqual([]);
  });

  it('attendance on a saved event (owner only)', async () => {
    const map = (await A.from('maps').select('id').order('created_at').limit(1).single()).data!.id;
    const g = (await A.from('groups').insert({ name: `Going ${RUN}`, color: '#2f5bea' }).select('id').single()).data!.id;
    cleanup.push(() => A.from('groups').delete().eq('id', g));
    const pin = await A.rpc('save_event_pin', { p_map_id: map, p_event_id: eventId, p_group_ids: [g], p_attendance: 'going' });
    expect(pin.error).toBeNull();
    cleanup.push(() => A.from('pins').delete().eq('id', pin.data as string));
    expect((await A.from('pins').select('attendance').eq('id', pin.data as string).single()).data!.attendance).toBe('going');
    expect((await B.from('pins').update({ attendance: 'interested' }).eq('id', pin.data as string).select('id')).data).toEqual([]);
    expect((await A.rpc('save_event_pin', { p_map_id: map, p_event_id: eventId, p_group_ids: [g], p_attendance: 'maybe' })).error).not.toBeNull();
  });

  it('add_to_collab: owner allowed; viewer and stranger refused; coordinates from the server', async () => {
    const collab = (await A.rpc('create_collab_map', { p_name: `LM ${RUN}` })).data as string;
    cleanup.push(() => A.from('collab_maps').delete().eq('id', collab));
    const inv = (await A.rpc('create_collab_invitation', { p_map_id: collab, p_role: 'viewer', p_expires_in_hours: 1 })).data[0];
    expect((await B.rpc('accept_collab_invitation', { p_token: inv.token })).error).toBeNull();

    const added = await A.rpc('add_to_collab', { p_collab_map_id: collab, p_event_id: eventId, p_attendance: 'going' });
    expect(added.error).toBeNull();
    const row = (await B.from('shared_pins').select('latitude, longitude, attendance, title').eq('id', added.data as string).single()).data!;
    expect(row).toMatchObject({ latitude: 0.5, longitude: -30, attendance: 'going' }); // event location, not client input
    const place = await A.rpc('add_to_collab', { p_collab_map_id: collab, p_place_ref: 'osm:way/427818536', p_title: 'Central Park', p_latitude: 40.7826, p_longitude: -73.9656 });
    expect(place.error).toBeNull();

    expect((await B.rpc('add_to_collab', { p_collab_map_id: collab, p_event_id: eventId })).error?.message).toMatch(/editor access/);
    expect((await C.rpc('add_to_collab', { p_collab_map_id: collab, p_event_id: eventId })).error?.message).toMatch(/editor access/);
    expect((await C.from('shared_pins').select('id').eq('collab_map_id', collab)).data).toEqual([]);
  });
});
