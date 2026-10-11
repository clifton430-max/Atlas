import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DEFAULT_PIN_COLOR, DROPLET_PATH, PinMarkerVisual } from '@/features/pins/PinMarkerVisual';
import { DEFAULT_APPEARANCE } from '@/lib/types';

describe('PinMarkerVisual', () => {
  it('standard pins are droplets (the reference marker): tip on the coordinate, glyph in the head', () => {
    const { container } = render(<PinMarkerVisual appearance={DEFAULT_APPEARANCE} fallbackIcon="map-pin" />);
    expect(container.querySelector('[data-droplet="true"]')).not.toBeNull();
    const body = [...container.querySelectorAll('path')].find((p) => p.getAttribute('d') === DROPLET_PATH && p.getAttribute('stroke'));
    expect(body!.getAttribute('fill')).toBe(DEFAULT_PIN_COLOR);
    expect(body!.getAttribute('stroke')).toBe('#ffffff');
  });

  it('saved places keep their category look as a droplet', () => {
    const { container } = render(<PinMarkerVisual appearance={DEFAULT_APPEARANCE} fallbackIcon="map-pin" glyph={{ color: '#c2410c', icon: [['circle', { cx: '12', cy: '12', r: '4' }]] }} />);
    const body = [...container.querySelectorAll('path')].find((p) => p.getAttribute('d') === DROPLET_PATH && p.getAttribute('stroke'));
    expect(body!.getAttribute('fill')).toBe('#c2410c');
  });

  it('an uploaded image fills the droplet head', () => {
    const { container } = render(
      <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, imageId: 'img1', imageMask: 'circle' }} imageUrl="https://x/img.webp" fallbackIcon="map-pin" />,
    );
    expect(container.querySelector('image')!.getAttribute('href')).toBe('https://x/img.webp');
    expect(container.querySelector('clipPath circle')).not.toBeNull();
  });

  it('explicitly chosen shapes still render the image itself as the marker', () => {
    const { container } = render(
      <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, shape: 'rounded', imageId: 'img1', imageMask: 'circle' }} imageUrl="https://x/img.webp" fallbackIcon="map-pin" />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
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
    const body = [...container.querySelectorAll('path')].find((p) => p.getAttribute('d') === DROPLET_PATH && p.getAttribute('stroke'));
    expect(body!.getAttribute('fill')).toBe('#00ff00');
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
