import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PinMarkerVisual } from '@/features/pins/PinMarkerVisual';
import { DEFAULT_APPEARANCE } from '@/lib/types';

describe('PinMarkerVisual', () => {
  it('renders the uploaded image as the marker with no default shape underneath', () => {
    const { container } = render(
      <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, imageId: 'img1', imageMask: 'circle' }} imageUrl="https://x/img.webp" fallbackIcon="map-pin" />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')!.style.borderRadius).toBe('50%');
  });

  it('renders a shape marker when no image is set', () => {
    const { container } = render(<PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, shape: 'star', color: '#ff0000' }} fallbackIcon="map-pin" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('polygon')!.getAttribute('fill')).toBe('#ff0000');
  });

  it('group colors appear as badges and never override the custom color', () => {
    const { container } = render(
      <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, color: '#00ff00' }} groupColors={['#123456', '#abcdef']} fallbackIcon="map-pin" />,
    );
    expect(container.querySelector('circle')!.getAttribute('fill')).toBe('#00ff00');
    const badges = [...container.querySelectorAll('span.rounded-full')].map((s) => (s as HTMLElement).style.background);
    expect(badges).toEqual(['rgb(18, 52, 86)', 'rgb(171, 205, 239)']);
  });

  it('shows a missing-image indicator instead of a broken image', () => {
    const { container } = render(
      <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, imageId: 'gone' }} imageUrl={null} fallbackIcon="map-pin" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.lucide-image-off')).not.toBeNull();
  });
});
