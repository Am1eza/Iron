// @vitest-environment node
/**
 * Regression test for a real production incident: articles seeded on
 * container boot (SEED_ON_START=true, the default — see docker-compose.yml)
 * came back with fresh `created_at` timestamps after an editor deleted them
 * and the container was later restarted for an unrelated deploy. The SKUs
 * block already skipped re-seeding once the table held real rows; the
 * articles block did not, and `onConflictDoNothing()` alone doesn't skip a
 * *run* — it only dedupes the rows within it, so a deleted id is a fresh
 * insert on the very next boot.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from './schema';
import { seedDatabase } from './seed';

describe('seedDatabase — articles', () => {
  it('does not resurrect a fixture article an editor deleted, on a later re-seed', async () => {
    const { db, close } = await createTestDb();
    try {
      await seedDatabase(db, { log: () => {} });
      const seeded = await db.select().from(schema.articles);
      expect(seeded.length).toBeGreaterThan(0);
      const victim = seeded[0];
      if (!victim) throw new Error('expected at least one seeded article');

      await db.delete(schema.articles).where(eq(schema.articles.id, victim.id));

      // Simulates the container restarting with SEED_ON_START=true while
      // real content already exists — the exact sequence that reintroduced
      // the deleted rows in production.
      await seedDatabase(db, { log: () => {} });

      const after = await db.select().from(schema.articles);
      expect(after.find((a) => a.id === victim.id)).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('still seeds fixture articles into a genuinely empty table', async () => {
    const { db, close } = await createTestDb();
    try {
      await seedDatabase(db, { log: () => {} });
      const seeded = await db.select().from(schema.articles);
      expect(seeded.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
