/**
 * One-off, re-runnable seed: the owner's opening «بر اساس کارخانه» order for
 * میلگرد and ورق (US-18.2).
 *
 * PR #186 shipped the table and the API, #188 the panel and the public sort,
 * and both said the owner's starting data would go in through the UI once
 * deployed. It never did — `factory_order` was still empty in production two
 * days later, so every price page was still sorting mills by whichever was
 * cheapest that morning. This puts the intended rows in.
 *
 * Goes through `setFactoryOrder` rather than an INSERT so the seed exercises
 * the panel's own write path: one transaction, delete-then-insert scoped to
 * the category, the same de-duplication, the same 1-based `order`. The names
 * are pushed through `normalizePersian` for the same reason the PUT handler
 * does it — a row whose ZWNJ or yeh spelling differs from `skus.factory`
 * matches nothing and silently does nothing. Here that normalization should
 * be a no-op (the names below were copied out of the column), so the script
 * ASSERTS it is, and refuses to write if a name normalizes to something the
 * category's SKUs don't carry.
 *
 * ورق gets one row on purpose. The owner named فولاد مبارکه as the leader and
 * nothing else; `factoriesForCategory` sorts un-ordered names after ordered
 * ones, so a single row is exactly "مبارکه first, everyone else as before".
 * Inventing an order for the other nine mills would be putting words in the
 * owner's mouth.
 *
 * Cache: `setFactoryOrder` is the repo, not the route, so nothing here
 * revalidates — `safeRevalidatePath` no-ops outside a Next request context
 * anyway. The price pages carry `revalidate = 300`, so the new order appears
 * within five minutes of this run without any further action.
 *
 *   ./node_modules/.bin/tsx scripts/seedFactoryOrder.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';
import { runWithScopedDb } from '../src/lib/server/db/client';
import { setFactoryOrder, factoriesForCategory } from '../src/lib/server/repos/catalogAdminRepo';
import { normalizePersian } from '../src/lib/utils/persianText';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seed-factory-order] DATABASE_URL is not set.');
  process.exit(1);
}

/** Category slug → the owner's ordered mills. Slug, not id, so the intent is readable. */
const ORDER: Record<string, string[]> = {
  rebar: ['ذوب‌آهن اصفهان', 'نیشابور', 'کویر کاشان', 'شاهرود', 'ابرکوه', 'امیرکبیر خزر'],
  sheet: ['فولاد مبارکه'],
};

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

let failed = false;

await runWithScopedDb(db, pool, async () => {
  for (const [slug, wanted] of Object.entries(ORDER)) {
    const [cat] = await db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug));
    if (!cat) {
      console.error(`[seed-factory-order] no category with slug «${slug}».`);
      failed = true;
      continue;
    }

    // The names actually carried by this category's live SKUs. An order row
    // that isn't in here sorts nothing (see the schema note in #186), which is
    // a silent failure — so it's a hard stop, not a warning.
    const live = new Set(
      (
        await db
          .selectDistinct({ factory: schema.skus.factory })
          .from(schema.skus)
          .where(
            and(
              eq(schema.skus.categoryId, cat.id),
              sql`${schema.skus.factory} is not null and ${schema.skus.factory} <> ''`,
            ),
          )
      ).flatMap((r) => (r.factory ? [r.factory] : [])),
    );

    const normalized = wanted.map(normalizePersian);
    console.log(`\n${cat.name} (${slug} · ${cat.id}) — ${normalized.length} mill(s):`);
    normalized.forEach((f, i) => {
      const drifted = f !== wanted[i] ? '  ⚠ normalizePersian changed this name' : '';
      const missing = live.has(f) ? '' : '  ✗ NOT a factory on any live SKU in this category';
      if (drifted || missing) failed = true;
      console.log(`  ${i + 1}. ${f}${drifted}${missing}`);
    });

    if (!APPLY) continue;
    if (failed) break;
    const count = await setFactoryOrder(cat.id, normalized);
    console.log(`  → wrote ${count} row(s).`);
    for (const row of await factoriesForCategory(cat.id)) {
      console.log(`     ${row.order ?? '–'}  ${row.factory}  (${row.skuCount} SKU)`);
    }
  }
});

await pool.end();

if (failed) {
  console.error('\n[seed-factory-order] names did not check out — nothing written.');
  process.exit(1);
}
console.log(APPLY ? '\n[seed-factory-order] done.' : '\n[seed-factory-order] dry run — pass --apply to write.');
