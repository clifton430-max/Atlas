/**
 * Meetups at a shared pin: user-created plans, clearly labelled as such and
 * separate from any official event schedule. Editors/owners plan meetups;
 * every member can join or leave; the organiser or map owner can edit,
 * reschedule or cancel. The server re-checks every rule.
 */
import { useState } from 'react';
import { CalendarPlus, ChevronDown, Pencil, Users, XCircle } from 'lucide-react';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import type { CollabMap } from '@/lib/types';
import {
  meetupSchedule, meetupStatus, useMeetupMutations, useMeetups, validateMeetupInput,
  type Meetup, type MeetupInput, type MeetupVisibility,
} from './meetups';

const STATUS: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'bg-accent-soft text-accent-strong' },
  live: { label: 'Happening now', cls: 'bg-lime-soft text-lime-ink ring-1 ring-lime-strong' },
  finished: { label: 'Finished', cls: 'bg-neutral-100 text-neutral-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-soft text-danger' },
};

export function MeetupsSection({ pinId, map, me }: { pinId: string; map: CollabMap; me: { id: string; name: string } | null }) {
  const meetups = useMeetups(map.id);
  const [creating, setCreating] = useState(false);
  const list = (meetups.data ?? []).filter((m) => m.sharedPinId === pinId)
    .sort((a, b) => order(a) - order(b) || a.startsAt.localeCompare(b.startsAt));
  const canPlan = map.myRole === 'owner' || map.myRole === 'editor';

  return (
    <section aria-labelledby={`meetups-${pinId}`} className="space-y-2 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <h4 id={`meetups-${pinId}`} className="flex items-center gap-1.5 text-[13px] font-semibold"><Users className="size-4" aria-hidden />Meetups</h4>
        {canPlan && !creating && <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>Plan a meetup</Button>}
      </div>
      <p className="text-[11px] text-neutral-500">Plans made by members of this map — not official event times.</p>
      {creating && <MeetupForm mapId={map.id} pinId={pinId} me={me} onDone={() => setCreating(false)} />}
      {meetups.isLoading ? <Spinner /> : meetups.error ? <ErrorMessage error={meetups.error} /> : list.length === 0 && !creating ? (
        <p className="text-xs text-neutral-500">No meetups here yet.{canPlan ? '' : ' Editors and owners can plan one.'}</p>
      ) : (
        <ul className="space-y-2">{list.map((m) => <MeetupItem key={m.id} m={m} map={map} me={me} />)}</ul>
      )}
    </section>
  );
}

const order = (m: Meetup) => ({ live: 0, upcoming: 1, finished: 2, cancelled: 3 })[meetupStatus(m)];

function MeetupItem({ m, map, me }: { m: Meetup; map: CollabMap; me: { id: string; name: string } | null }) {
  const toast = useToast();
  const { join, leave, cancel } = useMeetupMutations(map.id, me);
  const [editing, setEditing] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const status = meetupStatus(m);
  const canManage = !!me && (m.createdBy === me.id || map.myRole === 'owner') && status !== 'cancelled';
  const full = m.capacity != null && m.count >= m.capacity && !m.meGoing;
  const open = status === 'upcoming' || status === 'live';

  if (editing) return <li><MeetupForm mapId={map.id} pinId={m.sharedPinId} me={me} existing={m} onDone={() => setEditing(false)} /></li>;

  return (
    <li className={cn('rounded-xl p-3 ring-1 ring-line', status === 'live' && 'ring-lime-strong')} data-testid="meetup">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className={cn('inline-block rounded-full px-2 py-px text-[10px] font-semibold', STATUS[status].cls)}>{STATUS[status].label}</span>
          <p className="mt-1 text-[13px] font-medium text-neutral-900">{meetupSchedule(m)}</p>
          <p className="text-[11px] text-neutral-500">Organised by {m.createdBy === me?.id ? 'you' : m.createdByName ?? 'a former member'}</p>
        </div>
        {canManage && (
          <div className="flex gap-0.5">
            <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Edit or reschedule meetup" onClick={() => setEditing(true)}><Pencil className="size-3.5" aria-hidden /></button>
            <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Cancel meetup" disabled={cancel.isPending}
              onClick={() => cancel.mutate(m.id, { onSuccess: () => toast.success('Meetup cancelled. Members were notified.'), onError: (e) => toast.error(e) })}>
              <XCircle className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
      {m.description && <p className="mt-1.5 whitespace-pre-wrap text-xs text-neutral-700">{m.description}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" className="flex items-center gap-2 text-xs text-neutral-700" aria-expanded={showPeople} onClick={() => setShowPeople((v) => !v)}>
          <AvatarStack people={m.attendees} total={m.count} />
          <span>{m.count} going{m.capacity ? ` · ${m.capacity} max` : ''}</span>
          <ChevronDown className={cn('size-3.5 transition-transform', showPeople && 'rotate-180')} aria-hidden />
        </button>
        {open && me && (m.meGoing
          ? <Button size="sm" variant="secondary" loading={leave.isPending} onClick={() => leave.mutate(m.id, { onError: (e) => toast.error(e) })}>Leave</Button>
          : <Button size="sm" variant="cta" disabled={full} loading={join.isPending} onClick={() => join.mutate(m.id, { onError: (e) => toast.error(e) })}>{full ? 'Full' : 'Join'}</Button>)}
      </div>
      {showPeople && (
        <ul className="mt-2 space-y-1" aria-label="People going">
          {m.attendees.map((a) => <li key={a.userId} className="flex items-center gap-2 text-xs"><Avatar userId={a.userId} name={a.name} size="xs" />{a.userId === me?.id ? 'You' : a.name}</li>)}
          {m.count > m.attendees.length && <li className="text-[11px] text-neutral-500">{m.count - m.attendees.length} more — this organiser keeps the guest list private.</li>}
          {m.count === 0 && <li className="text-[11px] text-neutral-500">Nobody yet.</li>}
        </ul>
      )}
    </li>
  );
}

/** datetime-local <-> ISO in the user's own time zone (what the inputs show). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function MeetupForm({ mapId, pinId, at, me, existing, onDone }: {
  mapId: string; pinId?: string; me: { id: string; name: string } | null; existing?: Meetup; onDone: () => void;
  /** Plan at arbitrary coordinates instead of an existing pin (creates the meeting-point pin). */
  at?: { latitude: number; longitude: number };
}) {
  const toast = useToast();
  const { create, createAt, update } = useMeetupMutations(mapId, me);
  const [title, setTitle] = useState('');
  const tz = existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const soon = new Date(Math.ceil(Date.now() / 1800_000) * 1800_000 + 3600_000).toISOString();
  const [start, setStart] = useState(toLocalInput(existing?.startsAt ?? soon));
  const [end, setEnd] = useState(toLocalInput(existing?.endsAt ?? new Date(Date.parse(soon) + 2 * 3600_000).toISOString()));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [capacity, setCapacity] = useState(existing?.capacity ? String(existing.capacity) : '');
  const [visibility, setVisibility] = useState<MeetupVisibility>(existing?.visibility ?? 'members');
  const [error, setError] = useState<unknown>(null);
  const busy = create.isPending || createAt.isPending || update.isPending;

  const submit = () => {
    const startsAt = new Date(start);
    const endsAt = new Date(end);
    const cap = capacity.trim() ? Number(capacity) : null;
    const invalid = validateMeetupInput({ startsAt, endsAt, capacity: cap });
    if (invalid) return setError(invalid);
    if (at && !title.trim()) return setError('Give the meeting point a name.');
    const input: MeetupInput = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: tz, description: description.trim() || null, capacity: cap, visibility };
    const opts = { onSuccess: () => { toast.success(existing ? 'Meetup updated.' : 'Meetup planned. Members were notified.'); onDone(); }, onError: setError };
    if (existing) update.mutate({ ...input, id: existing.id }, opts);
    else if (at) createAt.mutate({ ...input, title: title.trim(), ...at }, opts);
    else if (pinId) create.mutate({ ...input, sharedPinId: pinId }, opts);
  };

  const field = 'mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm';
  return (
    <form className="space-y-2 rounded-xl bg-canvas p-3" aria-label={existing ? 'Edit meetup' : 'Plan a meetup'} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {at && (
        <label className="block text-xs text-neutral-700">Meeting point name
          <input required value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. North gate of the park" className={field} autoFocus />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-700">Starts<input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
        <label className="text-xs text-neutral-700">Ends<input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={field} /></label>
      </div>
      <p className="text-[11px] text-neutral-500">Times are in {tz}.</p>
      <label className="block text-xs text-neutral-700">Description (optional)
        <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-16 w-full rounded-lg border border-line bg-white p-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-700">Capacity (optional)<input type="number" min={1} max={500} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={field} /></label>
        <label className="text-xs text-neutral-700">Who sees the guest list
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as MeetupVisibility)} className={field}>
            <option value="members">All map members</option>
            <option value="private_attendees">Only organiser &amp; owner</option>
          </select>
        </label>
      </div>
      <ErrorMessage error={error} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
        <Button size="sm" variant="cta" type="submit" loading={busy}>{existing ? 'Save changes' : 'Plan meetup'}</Button>
      </div>
    </form>
  );
}
