/**
 * OpenStreetMap / Wikimedia helpers for the place-details Edge Function.
 * Pure TypeScript (no Deno/browser APIs) so Vitest can test it.
 *
 * Honesty rules:
 *   - Only tags present on the OSM element are used; missing -> null.
 *   - opening_hours is returned verbatim (never interpreted).
 *   - Images come only from Wikimedia Commons files explicitly linked to the
 *     element (wikimedia_commons / image tags pointing at Commons, or the
 *     linked Wikidata item's P18), and are returned with license + author.
 *   - Contained POIs come from OSM area containment of the parent way/relation.
 */

export type OsmType = 'node' | 'way' | 'relation';
export const USER_AGENT = 'Atlas/1.0 (map app; https://github.com/clifton430-max/Atlas)';

export function parseRef(ref: unknown): { type: OsmType; id: number } | null {
  if (typeof ref !== 'string') return null;
  const m = /^osm:(node|way|relation)\/(\d{1,15})$/.exec(ref);
  if (!m) return null;
  const id = Number(m[2]);
  return Number.isSafeInteger(id) && id > 0 ? { type: m[1] as OsmType, id } : null;
}

const clean = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); // eslint-disable-line no-control-regex
  return s ? s.slice(0, max) : null;
};

export interface ExtractedTags {
  name: string | null;
  address: string | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  /** OSM `wheelchair` value as mapped (yes / limited / no / designated); never inferred. */
  wheelchair: 'yes' | 'limited' | 'no' | 'designated' | null;
  cuisine: string | null;
  description: string | null;
  wikipedia: string | null;
  wikidata: string | null;
  commonsFile: string | null;
}

/** Normalize a website tag to an https URL when it is safely upgradable; otherwise null. */
export function normalizeWebsite(v: string | null): string | null {
  if (!v) return null;
  let s = v.trim();
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A plausible single email address, else null (OSM values are free text). */
export function normalizeEmail(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i.test(s) ? s : null;
}

/** Commons file title ("File:Foo.jpg") from a wikimedia_commons or image tag, if it really is a Commons file. */
export function commonsFileFrom(tags: Record<string, string>): string | null {
  const wc = clean(tags.wikimedia_commons, 300);
  if (wc && /^File:/i.test(wc)) return `File:${wc.slice(5)}`;
  const img = clean(tags.image, 500);
  if (img) {
    const page = /^https?:\/\/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i.exec(img);
    if (page) return decodeURIComponent(page[1]).replace(/_/g, ' ');
    if (/^File:/i.test(img)) return img;
  }
  return null;
}

export function extractTags(tags: Record<string, string> | null | undefined): ExtractedTags {
  const t = tags ?? {};
  const street = [clean(t['addr:housenumber'], 20), clean(t['addr:street'], 120)].filter(Boolean).join(' ');
  const locality = [clean(t['addr:city'], 80), clean(t['addr:postcode'], 20)].filter(Boolean).join(' ');
  const address = clean(t['addr:full'], 300) ?? ([street, locality].filter(Boolean).join(', ') || null);
  const wp = clean(t.wikipedia, 200);
  let wikipedia: string | null = null;
  if (wp) {
    const m = /^([a-z-]{2,12}):(.+)$/.exec(wp);
    if (m) wikipedia = `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g, '_'))}`;
  }
  const wd = clean(t.wikidata, 20);
  return {
    name: clean(t.name, 200),
    address,
    openingHours: clean(t.opening_hours, 300),
    website: normalizeWebsite(clean(t.website, 300) ?? clean(t['contact:website'], 300)),
    phone: clean(t.phone, 40) ?? clean(t['contact:phone'], 40),
    email: normalizeEmail(clean(t.email, 120) ?? clean(t['contact:email'], 120)),
    wheelchair: (['yes', 'limited', 'no', 'designated'] as const).find((v) => v === t.wheelchair) ?? null,
    cuisine: clean(t.cuisine, 120),
    description: clean(t.description, 500),
    wikipedia,
    wikidata: wd && /^Q\d{1,12}$/.test(wd) ? wd : null,
    commonsFile: commonsFileFrom(t),
  };
}

/** Strip HTML from Commons extmetadata values (artist credits contain links). */
export function stripHtml(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const out = s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  return out ? out.slice(0, 200) : null;
}

export interface CommonsImage {
  thumbUrl: string; url: string; width: number | null; height: number | null;
  sourcePage: string; license: string | null; licenseUrl: string | null; artist: string | null;
}

// Wikimedia-hosted files only (Commons serves thumbnails from thumb.wikimedia.org).
const isWikimediaHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//.test(u);

/** Parse a Commons `prop=imageinfo&iiprop=url|extmetadata` response. Only returns images with license data. */
export function parseCommonsImageInfo(json: unknown): CommonsImage | null {
  const pages = (json as { query?: { pages?: Record<string, { imageinfo?: Record<string, unknown>[] }> } })?.query?.pages;
  const info = pages ? Object.values(pages)[0]?.imageinfo?.[0] : undefined;
  if (!info) return null;
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
  const license = stripHtml(meta.LicenseShortName?.value);
  const thumb = info.thumburl ?? info.url;
  if (!isWikimediaHttps(thumb) || !isWikimediaHttps(info.url) || typeof info.descriptionurl !== 'string' || !license) return null;
  const licenseUrl = typeof meta.LicenseUrl?.value === 'string' && /^https?:\/\//.test(meta.LicenseUrl.value) ? meta.LicenseUrl.value : null;
  return {
    thumbUrl: thumb, url: info.url, width: Number(info.thumbwidth ?? info.width) || null, height: Number(info.thumbheight ?? info.height) || null,
    sourcePage: info.descriptionurl, license, licenseUrl, artist: stripHtml(meta.Artist?.value),
  };
}

export function commonsImageInfoUrl(fileTitle: string, width = 640): string {
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo', titles: fileTitle,
    iiprop: 'url|extmetadata', iiurlwidth: String(width), iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
  });
  return `https://commons.wikimedia.org/w/api.php?${p}`;
}

export function wikidataImageClaimUrl(qid: string): string {
  return `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetclaims', format: 'json', entity: qid, property: 'P18' })}`;
}

export function parseWikidataP18(json: unknown): string | null {
  const claims = (json as { claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } })?.claims?.P18;
  const v = claims?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' && v.trim() ? `File:${v.trim()}` : null;
}

/** Which parents get a "points of interest inside" lookup (areas only). */
export function supportsChildren(type: OsmType, tags: Record<string, string> | null | undefined): boolean {
  if (type === 'node' || !tags) return false;
  return /^(park|garden|nature_reserve|stadium|zoo|theme_park|water_park)$/.test(tags.leisure ?? '')
    || /^(museum|zoo|theme_park|attraction|aquarium)$/.test(tags.tourism ?? '')
    || /^(university|college)$/.test(tags.amenity ?? '');
}

/** Public Overpass instances, tried in order (they are frequently overloaded). */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function overpassChildrenQuery(type: Exclude<OsmType, 'node'>, id: number): string {
  // Nodes only: points of interest are almost always mapped as nodes, and node
  // lookups stay fast even for very large areas (e.g. Central Park).
  const el = type === 'way' ? 'way' : 'rel';
  return `[out:json][timeout:15];${el}(${id});map_to_area->.a;(`
    + 'node(area.a)["name"]["tourism"];'
    + 'node(area.a)["name"]["historic"];'
    + 'node(area.a)["name"]["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|theatre|arts_centre|library|cinema)$"];'
    + 'node(area.a)["name"]["leisure"~"^(garden|playground|sports_centre|stadium|swimming_pool)$"];'
    + ');out 60;';
}

export interface ChildPoi { ref: string; name: string; subclass: string; latitude: number; longitude: number }

export function parseOverpassChildren(json: unknown, selfRef: string): ChildPoi[] {
  const els = (json as { elements?: Record<string, unknown>[] })?.elements ?? [];
  const out: ChildPoi[] = [];
  const seen = new Set<string>();
  for (const e of els) {
    const type = e.type as string;
    if (!['node', 'way', 'relation'].includes(type) || typeof e.id !== 'number') continue;
    const ref = `osm:${type}/${e.id}`;
    if (ref === selfRef || seen.has(ref)) continue;
    const tags = (e.tags ?? {}) as Record<string, string>;
    const name = clean(tags.name, 200);
    const lat = typeof e.lat === 'number' ? e.lat : (e.center as { lat?: number } | undefined)?.lat;
    const lon = typeof e.lon === 'number' ? e.lon : (e.center as { lon?: number } | undefined)?.lon;
    if (!name || typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const subclass = tags.tourism ?? tags.amenity ?? tags.leisure ?? tags.historic ?? '';
    seen.add(ref);
    out.push({ ref, name, subclass, latitude: lat, longitude: lon });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
}
