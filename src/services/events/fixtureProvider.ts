/**
 * In-browser provider over development fixtures. Used only when Supabase is
 * not configured at all; every result is labeled 'dev-fixture'.
 */
import type { AtlasEvent } from '@/lib/types';
import { buildDevFixtures } from './devFixtures';
import { inBBox, matchesKeyword, type EventProvider, type EventSearchQuery, type EventSearchResult } from './types';

export class LocalFixtureProvider implements EventProvider {
  readonly id = 'local-fixtures';
  private events: AtlasEvent[] = buildDevFixtures();

  async search(q: EventSearchQuery): Promise<EventSearchResult> {
    return {
      events: this.events.filter((e) => inBBox(e, q.bbox) && matchesKeyword(e, q.keyword)),
      source: 'dev-fixture',
      notice: 'Supabase is not configured, so Atlas is showing development sample events. These are not real listings.',
    };
  }

  async getById(id: string) {
    return this.events.find((e) => e.id === id) ?? null;
  }

  /** Keyword search ignoring the viewport (used by global search). */
  async searchAnywhere(keyword: string) {
    return this.events.filter((e) => matchesKeyword(e, keyword));
  }
}
