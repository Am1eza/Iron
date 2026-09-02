/**
 * Adds genuinely new, in-scope sub-categories discovered by cross-referencing
 * ahanonline.com's real product-category sitemap (350 URLs, fetched directly,
 * not guessed) against our current taxonomy.
 *
 * Deliberately excludes from ahanonline's tree: factory/brand-name leaf nodes
 * (e.g. «میلگرد-اصفهان») and size-number leaf nodes (e.g. «میلگرد-14») — those
 * map to our `skus.factory`/`skus.size` COLUMNS, not to `sub_categories` rows.
 * Also excludes non-ferrous/non-steel materials (copper, aluminum, polycarbonate)
 * and raw-material/exchange goods (billet, slab) that aren't retail SKUs here,
 * and ambiguous/specialized items (rail, bolts&nuts) left for a human call.
 *
 * New rows are created INACTIVE (is_active=false, 0 SKUs) — same convention as
 * every other placeholder sub-category already in this table (castellated, hea,
 * heb, etc.). Nothing changes on the live site until an admin adds real SKUs and
 * activates it. Dry-run by default; pass --apply to write.
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../src/lib/server/db/schema';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[add-ahanonline-subcats] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

const NEW_SUBS: { categorySlug: string; slug: string; name: string; order: number }[] = [
  // میلگرد (rebar)
  { categorySlug: 'rebar', slug: 'heat-treated', name: 'میلگرد حرارتی', order: 90 },
  { categorySlug: 'rebar', slug: 'coupler', name: 'کوپلر میلگرد', order: 91 },
  // انواع-ورق (sheet)
  { categorySlug: 'sheet', slug: 'grating', name: 'گریتینگ', order: 90 },
  { categorySlug: 'sheet', slug: 'aluzinc', name: 'آلوزینک (گالوالوم)', order: 91 },
  { categorySlug: 'sheet', slug: 'tin-coated', name: 'قلع‌اندود', order: 92 },
  { categorySlug: 'sheet', slug: 'perforated-black', name: 'ورق پانچ سیاه', order: 93 },
  { categorySlug: 'sheet', slug: 'wear-resistant', name: 'ورق ضد سایش', order: 94 },
  // انواع-لوله (pipe)
  { categorySlug: 'pipe', slug: 'well-casing', name: 'لوله جدار چاه', order: 90 },
  { categorySlug: 'pipe', slug: 'thick-walled', name: 'لوله گوشت‌دار', order: 91 },
  // انواع-پروفیل (profile)
  { categorySlug: 'profile', slug: 'congress', name: 'پروفیل کنگره', order: 90 },
];

async function main() {
  const cats = await db.select().from(schema.categories);
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');

  for (const row of NEW_SUBS) {
    const cat = catBySlug.get(row.categorySlug);
    if (!cat) {
      console.log(`SKIP (no such category): ${row.categorySlug}/${row.slug}`);
      continue;
    }
    const existing = await db
      .select()
      .from(schema.subCategories)
      .where(eq(schema.subCategories.categoryId, cat.id));
    if (existing.some((x) => x.slug === row.slug)) {
      console.log(`SKIP (already exists): ${row.categorySlug}/${row.slug}`);
      continue;
    }
    console.log(`ADD: ${row.categorySlug}/${row.slug} → «${row.name}» (order ${row.order}, inactive)`);
    if (APPLY) {
      await db.insert(schema.subCategories).values({
        id: ulid(),
        categoryId: cat.id,
        slug: row.slug,
        name: row.name,
        order: row.order,
      });
    }
  }
  console.log('Done.');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    return pool.end();
  })
  .finally(() => process.exit(0));
