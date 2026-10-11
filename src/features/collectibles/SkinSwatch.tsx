/**
 * Mini cartographic preview of a skin, drawn with the skin's real palette and
 * label style (the same values the theme applies to the map).
 */
import { PERSONAL_DEFAULT, skinThemeFor } from './skins';

export function SkinSwatch({ defId, className }: { defId: string | null; className?: string }) {
  const th = skinThemeFor(defId) ?? PERSONAL_DEFAULT;
  const fontStyle = th.font === 'italic' ? 'italic' : 'normal';
  const fontWeight = th.font === 'bold' ? 700 : 500;
  const id = `sw-${th.id}`;
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label={`Preview of the ${th.id.replace(/-/g, ' ')} map style`}>
      <defs>
        <radialGradient id={`${id}-v`} cx="50%" cy="50%" r="70%"><stop offset="60%" stopColor="transparent" /><stop offset="100%" stopColor={th.vignette ?? 'transparent'} /></radialGradient>
        {th.texture === 'stars' && <pattern id={`${id}-t`} width="40" height="40" patternUnits="userSpaceOnUse">{[[5, 7], [22, 15], [33, 30], [12, 33], [28, 4]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill="#fff" opacity="0.8" />)}</pattern>}
      </defs>
      <rect width="240" height="150" fill={th.background} />
      {th.texture === 'stars' && <rect width="240" height="150" fill={`url(#${id}-t)`} />}
      <path d="M0 0 H150 Q170 40 140 80 Q120 120 150 150 H0 Z" fill={th.land} />
      <path d="M150 0 H240 V150 H150 Q120 120 140 80 Q170 40 150 0 Z" fill={th.water} />
      <ellipse cx="55" cy="45" rx="30" ry="18" fill={th.park} />
      <ellipse cx="95" cy="118" rx="22" ry="12" fill={th.wood} />
      {[[20, 85], [40, 95], [70, 80], [100, 60], [110, 90]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="12" height="9" fill={th.building} />)}
      {th.graticule && [40, 80, 120, 160, 200].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="150" stroke={th.graticule} strokeDasharray="4 3" />)}
      <path d="M0 70 Q60 60 120 75 T150 72" stroke={th.road.casing} strokeWidth="7" fill="none" />
      <path d="M0 70 Q60 60 120 75 T150 72" stroke={th.road.motorway} strokeWidth="4.5" fill="none" />
      <path d="M70 0 Q75 60 60 150" stroke={th.road.major} strokeWidth="3.5" fill="none" />
      <path d="M0 125 Q40 115 90 135" stroke={th.road.minor} strokeWidth="2.5" fill="none" />
      <path d="M10 20 L130 140" stroke={th.rail} strokeWidth="1.5" strokeDasharray="5 3" fill="none" />
      <text x="20" y="30" fill={th.label} stroke={th.halo} strokeWidth="2.5" paintOrder="stroke" fontSize="13" fontStyle={fontStyle} fontWeight={fontWeight} fontFamily="'Noto Sans', Inter, sans-serif">Old Town</text>
      <text x="165" y="110" fill={th.label} stroke={th.halo} strokeWidth="2" paintOrder="stroke" fontSize="10" fontStyle="italic" fontFamily="'Noto Sans', Inter, sans-serif">Bay</text>
      {th.vignette && <rect width="240" height="150" fill={`url(#${id}-v)`} />}
    </svg>
  );
}
