/**
 * The Atlas mark: a map-pin droplet whose head is a globe (meridian and
 * equator), wrapped by a tilted golden orbit — your places, the world, and
 * the Titan's burden of carrying it. Original artwork (no third-party marks).
 *
 *   variant "tile"  app-icon style: the mark on a deep indigo→teal tile
 *   variant "mark"  the bare mark; `tone` picks ink for light or dark backgrounds
 *
 * The same geometry is used by public/atlas.svg (favicon) and the PNG app
 * icons (public/icons), so the identity is identical everywhere.
 */
import { useId } from 'react';

export function AtlasMark({ variant = 'mark', tone = 'light', className, title }: {
  variant?: 'tile' | 'mark'; tone?: 'light' | 'dark'; className?: string; title?: string;
}) {
  const id = useId().replace(/:/g, '');
  const ink = variant === 'tile' || tone === 'dark' ? '#fffaf0' : '#14235c';
  const globe = variant === 'tile' ? `url(#${id}-g)` : tone === 'dark' ? '#14235c' : '#ffffff';
  const lines = variant === 'tile' || tone === 'dark' ? '#fffaf0' : '#14235c';
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b2a6b" /><stop offset="1" stopColor="#0b6b6f" /></linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f3a8a" /><stop offset="1" stopColor="#0e7c7b" /></linearGradient>
        <linearGradient id={`${id}-o`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f6d77a" /><stop offset="1" stopColor="#d9a520" /></linearGradient>
      </defs>
      {variant === 'tile' && <rect width="64" height="64" rx="15" fill={`url(#${id}-t)`} />}
      {/* back half of the orbit (behind the pin) */}
      <path d="M8.6 31.2 A25 8.4 -16 0 1 55.4 17.8" fill="none" stroke={`url(#${id}-o)`} strokeWidth="3.2" strokeLinecap="round" opacity="0.75" />
      {/* the droplet pin */}
      <path d="M32 55.5C32 55.5 18.5 40.5 18.5 27a13.5 13.5 0 1 1 27 0C45.5 40.5 32 55.5 32 55.5Z" fill={ink} />
      {/* globe in the pin's head */}
      <circle cx="32" cy="27" r="8.6" fill={globe} />
      <ellipse cx="32" cy="27" rx="3.7" ry="8.6" fill="none" stroke={lines} strokeWidth="1.5" />
      <path d="M23.6 27h16.8" stroke={lines} strokeWidth="1.5" />
      <path d="M25.3 22.3h13.4M25.3 31.7h13.4" stroke={lines} strokeWidth="1.1" opacity="0.7" />
      {/* front half of the orbit and its little star */}
      <path d="M55.4 17.8 A25 8.4 -16 0 1 8.6 31.2" fill="none" stroke={`url(#${id}-o)`} strokeWidth="3.2" strokeLinecap="round" strokeDasharray="0 0" />
      <circle cx="51.6" cy="25.6" r="2.4" fill="#fff4cf" />
    </svg>
  );
}
