/**
 * OpenStreetMap `opening_hours` — a deliberately small, strict parser for the
 * common forms ("Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off", "24/7",
 * "Mo-Su 11:00-23:00,23:30-02:00"). Anything it doesn't fully understand
 * returns null and the UI shows the text exactly as listed instead — hours
 * are never guessed. Rules that apply only to holidays, months or weeks are
 * skipped and flagged (`partial`) so the UI can say exceptions aren't shown.
 *
 * Days are indexed Monday = 0 … Sunday = 6; times are minutes after midnight.
 * Ranges past midnight (22:00-02:00) spill into the next day.
 */
export type Span = [number, number];
export interface WeeklyHours {
  days: Span[][];
  /** True when some rules (holidays, months, weeks) were not represented. */
  partial: boolean;
}

const DAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SKIP = /\b(PH|SH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|easter|sunrise|sunset|dawn|dusk)\b|\[/;

function parseDays(sel: string): number[] | null {
  const out = new Set<number>();
  for (const part of sel.split(',')) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAY.indexOf(m[1] as typeof DAY[number]);
    const b = m[2] ? DAY.indexOf(m[2] as typeof DAY[number]) : a;
    for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; }
  }
  return [...out];
}

function parseTimes(s: string): Span[] | null {
  const spans: Span[] = [];
  for (const part of s.split(',')) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    let b = Number(m[3]) * 60 + Number(m[4]);
    if (a > 24 * 60 || b > 48 * 60 || Number(m[2]) > 59 || Number(m[4]) > 59) return null;
    if (b <= a) b += 24 * 60; // past midnight
    spans.push([a, b]);
  }
  return spans;
}

export function parseOpeningHours(raw: string | null | undefined): WeeklyHours | null {
  const text = raw?.trim();
  if (!text || text.length > 300) return null;
  const days: Span[][] = Array.from({ length: 7 }, () => []);
  if (text === '24/7') return { days: days.map(() => [[0, 24 * 60]]), partial: false };
  let partial = false;
  let any = false;
  for (const rule0 of text.split(';')) {
    const rule = rule0.trim().replace(/"[^"]*"/g, '').trim(); // drop comments
    if (!rule) continue;
    if (SKIP.test(rule)) { partial = true; continue; }
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const sel = m[1] ? parseDays(m[1].replace(/\s+/g, '')) : [0, 1, 2, 3, 4, 5, 6];
    const rest = m[2].trim();
    if (!sel) return null;
    if (/^(off|closed)$/i.test(rest)) { for (const d of sel) days[d] = []; any = true; continue; }
    const spans = rest === '24/7' || rest === '00:00-24:00' ? [[0, 24 * 60] as Span] : parseTimes(rest);
    if (!spans) return null;
    for (const d of sel) days[d] = spans; // later rules override earlier ones for the same day
    any = true;
  }
  return any ? { days, partial } : null;
}

const fmt = (min: number, locale?: string) => {
  const m = ((min % 1440) + 1440) % 1440;
  return new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
};
export const formatSpan = ([a, b]: Span, locale?: string) => (a === 0 && b === 1440 ? 'Open 24 hours' : `${fmt(a, locale)} – ${fmt(b, locale)}`);

/** Day index (Mo = 0) and minute of the day for an instant in a time zone. */
export function localDayMinute(timeZone: string, now = new Date()): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
  const h = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const mi = Number(parts.find((p) => p.type === 'minute')?.value);
  return { day: Math.max(0, day), minute: h * 60 + mi };
}

export type OpenStatus = { open: true; closesAt: number } | { open: false; opensAt: { day: number; minute: number } | null };

/** Open/closed at (day, minute), including ranges that spill over from the previous day. */
export function openStatus(h: WeeklyHours, day: number, minute: number): OpenStatus {
  for (const [a, b] of h.days[day]) if (minute >= a && minute < b) return { open: true, closesAt: b };
  const prev = (day + 6) % 7;
  for (const [, b] of h.days[prev]) if (b > 1440 && minute < b - 1440) return { open: true, closesAt: b - 1440 };
  for (let k = 0; k < 8; k++) {
    const d = (day + k) % 7;
    const next = h.days[d].map(([a]) => a).filter((a) => k > 0 || a > minute).sort((x, y) => x - y)[0];
    if (next != null) return { open: false, opensAt: { day: d, minute: next } };
  }
  return { open: false, opensAt: null };
}
