/**
 * Initials avatar. Atlas has no profile photos, so avatars are the person's
 * initials on a colour derived from their stable user id (never from the
 * display name, which can change or collide).
 */
import { cn } from './cn';

const COLORS = ['#2f5bea', '#c2410c', '#15803d', '#7e22ce', '#0e7490', '#be123c', '#a16207', '#4338ca'];
export function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ userId, name, size = 'sm', className }: { userId: string; name: string; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return (
    <span title={name} aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white',
        size === 'xs' ? 'size-5 text-[9px]' : size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-sm', className)}
      style={{ background: avatarColor(userId) }}>
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars with a "+N" overflow chip; `total` may exceed the named people (private lists). */
export function AvatarStack({ people, total, max = 4, size = 'xs' }: { people: { userId: string; name: string }[]; total: number; max?: number; size?: 'xs' | 'sm' }) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, total - shown.length);
  return (
    <span className="flex items-center -space-x-1.5" aria-label={`${total} going`}>
      {shown.map((p) => <Avatar key={p.userId} userId={p.userId} name={p.name} size={size} className="motion-safe:animate-rise-in" />)}
      {extra > 0 && (
        <span aria-hidden className={cn('grid place-items-center rounded-full bg-neutral-800 font-semibold text-white ring-2 ring-white', size === 'xs' ? 'h-5 min-w-5 px-1 text-[9px]' : 'h-7 min-w-7 px-1 text-[11px]')}>+{extra}</span>
      )}
    </span>
  );
}
