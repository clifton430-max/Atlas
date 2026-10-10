/**
 * OPT-IN (ATLAS_LIVE_RATE_LIMIT=1): verifies the public discover-events
 * endpoint throttles a single client. This deliberately exhausts this machine's
 * per-client budget for ~60 s, so it is not part of the default live run.
 */
import { describe, expect, it } from 'vitest';
import { LIVE, liveConfigured } from './env';

describe.skipIf(!liveConfigured || process.env.ATLAS_LIVE_RATE_LIMIT !== '1')('discover-events abuse control', () => {
  it('returns 429 with Retry-After once a client exceeds 60 requests/minute', async () => {
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 70; i++) {
      const r = await fetch(`${LIVE.url}/functions/v1/discover-events`, {
        method: 'POST',
        headers: { apikey: LIVE.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: { west: -74.05, south: 40.68, east: -73.9, north: 40.8 } }),
      });
      statuses.push(r.status);
      if (r.status === 429) retryAfter = r.headers.get('retry-after');
      await r.body?.cancel();
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(10);
    expect(retryAfter).toBe('60');
  }, 120_000);
});
