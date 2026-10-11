import { describe, expect, it } from 'vitest';
import { meetupShortLabel, meetupStatus, validateMeetupInput } from '@/features/collaboration/meetups';
import { avatarColor, initials } from '@/components/ui/Avatar';

const now = Date.parse('2026-10-10T15:00:00Z'); // 10:00 in Chicago (CDT)
const m = (s: string, e: string, extra = {}) => ({ startsAt: s, endsAt: e, cancelledAt: null, timezone: 'America/Chicago', ...extra });

describe('meetup status and labels', () => {
  it('upcoming / happening now / finished / cancelled', () => {
    expect(meetupStatus(m('2026-10-10T16:00:00Z', '2026-10-10T18:00:00Z'), now)).toBe('upcoming');
    expect(meetupStatus(m('2026-10-10T14:00:00Z', '2026-10-10T16:00:00Z'), now)).toBe('live');
    expect(meetupStatus(m('2026-10-10T12:00:00Z', '2026-10-10T14:00:00Z'), now)).toBe('finished');
    expect(meetupStatus(m('2026-10-10T16:00:00Z', '2026-10-10T18:00:00Z', { cancelledAt: '2026-10-09T00:00:00Z' }), now)).toBe('cancelled');
  });
  it('compact labels use the meetup time zone', () => {
    expect(meetupShortLabel(m('2026-10-11T00:30:00Z', '2026-10-11T02:00:00Z'), now, 'en-US')).toBe('Today 7:30 PM');
    expect(meetupShortLabel(m('2026-10-11T17:00:00Z', '2026-10-11T18:00:00Z'), now, 'en-US')).toBe('Tomorrow 12:00 PM');
    expect(meetupShortLabel(m('2026-10-10T14:00:00Z', '2026-10-10T17:00:00Z'), now, 'en-US')).toBe('Now · until 12:00 PM');
    expect(meetupShortLabel(m('2026-10-30T14:00:00Z', '2026-10-30T17:00:00Z'), now, 'en-US')).toBe('Oct 30');
  });
  it('client validation mirrors the server rules', () => {
    const d = (h: number) => new Date(now + h * 3600_000);
    expect(validateMeetupInput({ startsAt: d(2), endsAt: d(1), capacity: null }, now)).toMatch(/end after/);
    expect(validateMeetupInput({ startsAt: d(1), endsAt: d(1 + 24 * 8), capacity: null }, now)).toMatch(/7 days/);
    expect(validateMeetupInput({ startsAt: d(-3), endsAt: d(-2), capacity: null }, now)).toMatch(/already be over/);
    expect(validateMeetupInput({ startsAt: d(1), endsAt: d(2), capacity: 0 }, now)).toMatch(/Capacity/);
    expect(validateMeetupInput({ startsAt: d(1), endsAt: d(2), capacity: 12 }, now)).toBeNull();
  });
  it('avatars derive from stable ids, not names', () => {
    expect(avatarColor('u1')).toBe(avatarColor('u1'));
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('  bob ')).toBe('B');
  });
});
