/**
 * Pure visual for a pin marker (no data fetching, no permission logic).
 *
 * Modes:
 *  - Droplet (the standard pin, stored as shape "circle"): the teardrop pin
 *    used for every saved place and custom pin — coloured body, white rim,
 *    white glyph in the head, soft contact shadow; the tip is the exact
 *    coordinate. An uploaded image fills the droplet's round head.
 *  - Shape marker: SVG square/rounded/diamond/star (explicitly chosen in the
 *    appearance editor) with fill color, border and an optional centered icon.
 *  - Image marker: when an image URL is provided, the IMAGE ITSELF is the
 *    marker (masked circle/rounded/square with the pin's border as outline).
 *    No default marker is drawn underneath it.
 *
 * Group identity is shown as small colored badge dots at the top-right edge;
 * it never replaces the image or overrides an explicit custom color.
 */
import { useId, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { IconNode } from 'lucide';
import { LucideNode } from '@/features/places/CategoryIcon';
import type { ImageMask, PinAppearance, PinShape } from '@/lib/types';
import { iconFor } from './icons';

export const DEFAULT_PIN_COLOR = '#d64532';
/** Droplet outline (36 × 48 box); the tip is at (18, 45). */
export const DROPLET_PATH = 'M18 45C18 45 4.5 30.5 4.5 18.5a13.5 13.5 0 1 1 27 0C31.5 30.5 18 45 18 45Z';
/** Space below the tip inside the 48-unit box (the contact shadow). */
const TIP_PAD = 3 / 48;
const DEFAULT_BORDER = '#ffffff';

function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#171717' : '#ffffff';
}

const STAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 47 : 21;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

function ShapePath({ shape, fill, stroke, strokeWidth }: { shape: PinShape; fill: string; stroke: string; strokeWidth: number }) {
  const sw = strokeWidth * (100 / 32); // border width is in px at 32px base size
  const inset = sw / 2 + 1;
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'square':
      return <rect x={inset + 6} y={inset + 6} width={100 - 2 * (inset + 6)} height={100 - 2 * (inset + 6)} {...common} />;
    case 'rounded':
      return <rect x={inset + 4} y={inset + 4} width={100 - 2 * (inset + 4)} height={100 - 2 * (inset + 4)} rx={22} {...common} />;
    case 'diamond':
      return <polygon points={`50,${inset} ${100 - inset},50 50,${100 - inset} ${inset},50`} {...common} />;
    case 'star':
      return <polygon points={STAR} {...common} />;
    default:
      return <circle cx={50} cy={50} r={50 - inset} {...common} />;
  }
}

const maskRadius: Record<ImageMask, string> = { circle: '50%', rounded: '24%', square: '6%' };

export interface PinMarkerVisualProps {
  appearance: PinAppearance;
  /** Signed URL of the uploaded image, when the pin uses one. */
  imageUrl?: string | null;
  /** True while the image URL is still being resolved. */
  imageLoading?: boolean;
  fallbackIcon: 'map-pin' | 'ticket';
  groupColors?: string[];
  selected?: boolean;
  /** Multiplier from zoom level. */
  scale?: number;
  /**
   * Category look for pins that have no custom colour/icon (e.g. a saved
   * restaurant is a red droplet with a fork-and-knife), so saved places keep
   * the identity they had on the map.
   */
  glyph?: { color: string; icon: IconNode } | null;
}

/** True when this appearance is drawn as the standard droplet pin. */
export const isDroplet = (a: PinAppearance) => a.shape === 'circle';

function DropletVisual({ appearance, imageUrl, imageLoading, fallbackIcon, groupColors = [], selected, scale = 1, glyph }: PinMarkerVisualProps) {
  const clip = useId();
  const [broken, setBroken] = useState<string | null>(null);
  const w = Math.round(appearance.size * 1.125 * scale);
  const h = Math.round((w * 48) / 36);
  const fill = appearance.color ?? glyph?.color ?? DEFAULT_PIN_COLOR;
  const border = appearance.borderColor ?? DEFAULT_BORDER;
  const useImage = !!appearance.imageId && !!imageUrl && broken !== imageUrl;
  const imageMissing = !!appearance.imageId && !imageLoading && (!imageUrl || broken === imageUrl);
  const Icon = iconFor(appearance.icon, fallbackIcon);
  const iconPx = Math.round(w * 0.42);
  return (
    <span className="relative block origin-bottom transition-transform duration-150 ease-out"
      data-droplet="true"
      style={{ width: w, height: h, marginBottom: -Math.round(h * TIP_PAD), transform: selected ? 'scale(1.18)' : undefined }}>
      <svg viewBox="0 0 36 48" width={w} height={h} className="block overflow-visible" aria-hidden>
        <ellipse cx="18" cy="45.2" rx="5.5" ry="1.9" fill="rgba(0,0,0,0.25)" />
        <path d={DROPLET_PATH} transform="translate(0 1)" fill="rgba(0,0,0,0.18)" />
        {selected && <path d={DROPLET_PATH} fill="none" stroke="#2f5bea" strokeWidth="6" strokeLinejoin="round" opacity="0.35" />}
        <path d={DROPLET_PATH} fill={fill} stroke={border} strokeWidth={appearance.borderWidth ? 1.2 + appearance.borderWidth * 0.6 : 0} strokeLinejoin="round" />
        {/* subtle top highlight for depth */}
        <path d="M9 14a11 11 0 0 1 9-7" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
        {useImage && (
          <>
            <clipPath id={clip}><circle cx="18" cy="18.5" r="11" /></clipPath>
            <image href={imageUrl!} x="7" y="7.5" width="22" height="22" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} onError={() => setBroken(imageUrl!)} />
            <circle cx="18" cy="18.5" r="11" fill="none" stroke="#ffffff" strokeWidth="1.2" />
          </>
        )}
        {appearance.imageId && imageLoading && <circle cx="18" cy="18.5" r="11" className="animate-pulse" fill="rgba(255,255,255,0.45)" />}
      </svg>
      {!useImage && !(appearance.imageId && imageLoading) && (
        <span className="pointer-events-none absolute left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center" style={{ top: `${(18.5 / 48) * 100}%`, color: contrastText(fill) }} aria-hidden>
          {imageMissing ? <ImageOff style={{ width: iconPx, height: iconPx }} />
            : !appearance.icon && glyph ? <LucideNode icon={glyph.icon} style={{ width: iconPx, height: iconPx }} strokeWidth={2.5} />
              : <Icon style={{ width: iconPx, height: iconPx }} strokeWidth={2.5} />}
        </span>
      )}
      {groupColors.length > 0 && (
        <span className="pointer-events-none absolute -right-1 top-0 flex -space-x-1" aria-hidden>
          {groupColors.slice(0, 3).map((c, i) => (
            <span key={i} className="block size-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />
          ))}
        </span>
      )}
    </span>
  );
}

export function PinMarkerVisual(props: PinMarkerVisualProps) {
  return isDroplet(props.appearance) ? <DropletVisual {...props} /> : <ShapeVisual {...props} />;
}

function ShapeVisual({
  appearance, imageUrl, imageLoading, fallbackIcon, groupColors = [], selected, scale = 1,
}: PinMarkerVisualProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const size = Math.round(appearance.size * scale);
  const fill = appearance.color ?? DEFAULT_PIN_COLOR;
  const border = appearance.borderColor ?? DEFAULT_BORDER;
  const Icon = iconFor(appearance.icon, fallbackIcon);
  const useImage = !!appearance.imageId && !!imageUrl && broken !== imageUrl;
  const imageMissing = !!appearance.imageId && !imageLoading && (!imageUrl || broken === imageUrl);

  return (
    <span
      className="relative block transition-transform duration-150"
      style={{ width: size, height: size, transform: selected ? 'scale(1.12)' : undefined }}
    >
      {useImage ? (
        <img
          src={imageUrl!}
          alt=""
          draggable={false}
          onError={() => setBroken(imageUrl!)}
          className="block size-full bg-white object-cover shadow-[0_2px_6px_rgb(0_0_0/0.3)]"
          style={{
            borderRadius: maskRadius[appearance.imageMask],
            border: appearance.borderWidth ? `${appearance.borderWidth}px solid ${border}` : undefined,
          }}
        />
      ) : appearance.imageId && imageLoading ? (
        <span
          className="block size-full animate-pulse bg-neutral-300 shadow"
          style={{ borderRadius: maskRadius[appearance.imageMask] }}
          aria-hidden
        />
      ) : (
        <svg viewBox="0 0 100 100" className="block size-full drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]" aria-hidden>
          <ShapePath shape={appearance.shape} fill={fill} stroke={border} strokeWidth={appearance.borderWidth} />
        </svg>
      )}
      {!useImage && !(appearance.imageId && imageLoading) && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          {imageMissing ? (
            <ImageOff style={{ width: size * 0.45, height: size * 0.45, color: contrastText(fill) }} />
          ) : (
            <Icon style={{ width: size * 0.46, height: size * 0.46, color: contrastText(fill) }} strokeWidth={2.25} />
          )}
        </span>
      )}
      {groupColors.length > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex -space-x-1" aria-hidden>
          {groupColors.slice(0, 3).map((c, i) => (
            <span key={i} className="block size-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />
          ))}
        </span>
      )}
      {selected && (
        <span
          className="pointer-events-none absolute -inset-1 ring-2 ring-accent ring-offset-1"
          style={{ borderRadius: useImage ? maskRadius[appearance.imageMask] : '50%' }}
          aria-hidden
        />
      )}
    </span>
  );
}
