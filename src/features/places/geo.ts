/**
 * Distance helpers. Atlas only shows STRAIGHT-LINE (great-circle) distance,
 * labelled as such — never as walking or driving distance — and only when
 * the user has shared their location in this session.
 */
const R = 6_371_008.8; // mean Earth radius (m)

export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Imperial units for en-US/en-GB-style locales that use miles; metric otherwise. */
export function usesMiles(locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'): boolean {
  return /^en-(US|GB|LR|MM)$/i.test(locale) || locale === 'en';
}

export function formatDistance(meters: number, locale?: string): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (usesMiles(locale)) {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters * 3.28084 / 10) * 10} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** e.g. "1.2 km away (straight line)"; null if no location is known. */
export function distanceLabel(
  from: { latitude: number; longitude: number } | null,
  to: { latitude: number | null; longitude: number | null },
  locale?: string,
): string | null {
  if (!from || to.latitude == null || to.longitude == null) return null;
  return `${formatDistance(haversineMeters(from, { latitude: to.latitude, longitude: to.longitude }), locale)} away (straight line)`;
}
