/** Category/event-type badge: colored disc + icon, always next to a text label. */
import { createElement, type SVGProps } from 'react';
import type { IconNode } from 'lucide';
import { cn } from '@/components/ui/cn';

/** Render a vanilla-lucide IconNode as an inline React SVG. */
export function LucideNode({ icon, className, ...rest }: { icon: IconNode; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden {...rest}>
      {icon.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

export function CategoryDot({ color, icon, size = 'sm' }: { color: string; icon: IconNode; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full text-white ring-2 ring-white', size === 'sm' ? 'size-5' : 'size-7')} style={{ background: color }} aria-hidden>
      <LucideNode icon={icon} className={size === 'sm' ? 'size-3' : 'size-4'} />
    </span>
  );
}
