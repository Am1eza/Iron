/**
 * Hourly upkeep — purge expired OTPs / refresh tokens / stale rate rows and
 * thin market history so the ticker table never grows unbounded.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { cleanupExpiredAuth } from '@/lib/auth/store';
import type { Job } from './scheduler';

export const cleanupJob: Job = {
  name: 'cleanup',
  everyMs: 60 * 60 * 1000,
  async run() {
    await cleanupExpiredAuth();
    // Market points: after 48h keep at most one point per 15 minutes.
    const db = getDb();
    await db.execute(sql`
      DELETE FROM market_points mp
      WHERE mp.at < now() - interval '48 hours'
        AND mp.id NOT IN (
          SELECT DISTINCT ON (key, date_trunc('hour', at), floor(extract(minute FROM at) / 15)) id
          FROM market_points
          WHERE at < now() - interval '48 hours'
          ORDER BY key, date_trunc('hour', at), floor(extract(minute FROM at) / 15), at DESC
        )
    `);
  },
};
