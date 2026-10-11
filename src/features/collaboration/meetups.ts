/**
 * Meetups — user-created plans at a collaboration-map pin (never official
 * event data). Reads go through RLS; every write is an RPC that re-checks
 * membership, role, schedule and capacity on the server.
 *
 * Join/leave update the cache optimistically and roll back on failure;
 * realtime (useCollabRealtime) then refetches the authoritative state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';

export type MeetupVisibility = 'members' | 'private_attendees';
export type MeetupStatus = 'upcoming' | 'live' | 'finished' | 'cancelled';

export interface MeetupPerson { userId: string; name: string }
export interface Meetup {
  id: string;
  collabMapId: string;
  sharedPinId: string;
  createdBy: string;
  createdByName: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  description: string | null;
  capacity: number | null;
  visibility: MeetupVisibility;
  cancelledAt: string | null;
  /** Names visible to you (may be fewer than `count` for private lists). */
  attendees: MeetupPerson[];
  count: number;
  meGoing: boolean;
}

export const meetupsKey = (mapId: string) => ['meetups', mapId] as const;
type Row = Record<string, unknown>;
const personName = (p: Row | null | undefined) => (p ? String(p.display_name || p.username) : null);

export function meetupStatus(m: Pick<Meetup, 'startsAt' | 'endsAt' | 'cancelledAt'>, now = Date.now()): MeetupStatus {
  if (m.cancelledAt) return 'cancelled';
  if (now >= Date.parse(m.endsAt)) return 'finished';
  if (now >= Date.parse(m.startsAt)) return 'live';
  return 'upcoming';
}

/** Compact label for map markers: "Now · until 9:00 PM", "Today 7:30 PM", "Sat 7:30 PM", "Oct 21". */
export function meetupShortLabel(m: Pick<Meetup, 'startsAt' | 'endsAt' | 'cancelledAt' | 'timezone'>, now = Date.now(), locale?: string): string {
  const s = meetupStatus(m, now);
  const tz = m.timezone;
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
  const day = (d: Date | number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'finished') return 'Finished';
  if (s === 'live') return `Now · until ${time(m.endsAt)}`;
  const start = new Date(m.startsAt);
  const days = Math.round((Date.parse(day(start)) - Date.parse(day(now))) / 86400_000);
  if (days === 0) return `Today ${time(m.startsAt)}`;
  if (days === 1) return `Tomorrow ${time(m.startsAt)}`;
  if (days < 7) return `${new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: tz }).format(start)} ${time(m.startsAt)}`;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: tz }).format(start);
}

/** Full schedule in the organiser's time zone, e.g. "Sat, Oct 12, 7:30 – 9:00 PM CDT". */
export function meetupSchedule(m: Pick<Meetup, 'startsAt' | 'endsAt' | 'timezone'>, locale?: string): string {
  const f = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: m.timezone, timeZoneName: 'short' });
  return f.formatRange(new Date(m.startsAt), new Date(m.endsAt));
}

/** Client-side mirror of the server's schedule rules (the server is authoritative). */
export function validateMeetupInput(i: { startsAt: Date; endsAt: Date; capacity: number | null }, now = Date.now()): string | null {
  if (Number.isNaN(i.startsAt.getTime()) || Number.isNaN(i.endsAt.getTime())) return 'Choose a start and end time.';
  if (i.endsAt <= i.startsAt) return 'The meetup must end after it starts.';
  if (i.endsAt.getTime() - i.startsAt.getTime() > 7 * 86400_000) return 'Meetups can last at most 7 days.';
  if (i.endsAt.getTime() < now) return 'This meetup would already be over.';
  if (i.capacity != null && (!Number.isInteger(i.capacity) || i.capacity < 1 || i.capacity > 500)) return 'Capacity must be between 1 and 500.';
  return null;
}

export function useMeetups(mapId: string | undefined) {
  return useQuery({
    queryKey: meetupsKey(mapId ?? ''),
    enabled: !!mapId && mapId !== 'demo',
    queryFn: async (): Promise<Meetup[]> => {
      const sb = requireSupabase();
      const [rows, counts] = await Promise.all([
        sb.from('meetups').select(`id, collab_map_id, shared_pin_id, created_by, starts_at, ends_at, timezone, description, capacity, visibility, cancelled_at,
          organiser:profiles!meetups_created_by_fkey(username, display_name),
          meetup_attendees(user_id, joined_at, person:profiles!meetup_attendees_user_id_fkey(username, display_name))`)
          .eq('collab_map_id', mapId!).order('starts_at'),
        sb.rpc('meetup_counts', { p_collab_map_id: mapId! }),
      ]);
      const countBy = new Map(((unwrap(counts) ?? []) as Row[]).map((c) => [String(c.meetup_id), c]));
      return (unwrap(rows) as Row[]).map((r) => {
        const c = countBy.get(String(r.id));
        const att = ((r.meetup_attendees as Row[]) ?? [])
          .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))
          .map((a) => ({ userId: String(a.user_id), name: personName(a.person as Row) ?? 'Member' }));
        return {
          id: String(r.id), collabMapId: String(r.collab_map_id), sharedPinId: String(r.shared_pin_id),
          createdBy: String(r.created_by), createdByName: personName(r.organiser as Row),
          startsAt: String(r.starts_at), endsAt: String(r.ends_at), timezone: String(r.timezone),
          description: (r.description as string) ?? null, capacity: (r.capacity as number) ?? null,
          visibility: r.visibility as MeetupVisibility, cancelledAt: (r.cancelled_at as string) ?? null,
          attendees: att, count: Number(c?.attendees ?? att.length), meGoing: Boolean(c?.me_going),
        };
      });
    },
  });
}

export interface MeetupInput {
  startsAt: string; endsAt: string; timezone: string; description: string | null; capacity: number | null; visibility: MeetupVisibility;
}

export function useMeetupMutations(mapId: string, me: { id: string; name: string } | null) {
  const qc = useQueryClient();
  const key = meetupsKey(mapId);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const optimistic = (meetupId: string, going: boolean) => async () => {
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<Meetup[]>(key);
    qc.setQueryData<Meetup[]>(key, (list) => list?.map((m) => (m.id !== meetupId || !me ? m : {
      ...m, meGoing: going, count: Math.max(0, m.count + (going ? 1 : -1)),
      attendees: going ? [...m.attendees.filter((a) => a.userId !== me.id), { userId: me.id, name: me.name }] : m.attendees.filter((a) => a.userId !== me.id),
    })));
    return { prev };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: Meetup[] }) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); };

  return {
    create: useMutation({
      mutationFn: async (i: MeetupInput & { sharedPinId: string }) => unwrap(await requireSupabase().rpc('create_meetup', {
        p_shared_pin_id: i.sharedPinId, p_starts_at: i.startsAt, p_ends_at: i.endsAt, p_timezone: i.timezone,
        p_description: i.description ?? undefined, p_capacity: i.capacity ?? undefined, p_visibility: i.visibility, p_join: true,
      })) as string,
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async (i: MeetupInput & { id: string }) => {
        unwrap(await requireSupabase().rpc('update_meetup', {
          p_meetup_id: i.id, p_starts_at: i.startsAt, p_ends_at: i.endsAt, p_timezone: i.timezone,
          p_description: i.description ?? '', p_capacity: i.capacity as number, p_visibility: i.visibility,
        }));
      },
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: async (id: string) => { unwrap(await requireSupabase().rpc('cancel_meetup', { p_meetup_id: id })); },
      onSettled: refresh,
    }),
    join: useMutation({
      mutationFn: async (id: string) => unwrap(await requireSupabase().rpc('join_meetup', { p_meetup_id: id })) as number,
      onMutate: (id) => optimistic(id, true)(),
      onError: rollback,
      onSettled: refresh,
    }),
    leave: useMutation({
      mutationFn: async (id: string) => unwrap(await requireSupabase().rpc('leave_meetup', { p_meetup_id: id })) as number,
      onMutate: (id) => optimistic(id, false)(),
      onError: rollback,
      onSettled: refresh,
    }),
  };
}
