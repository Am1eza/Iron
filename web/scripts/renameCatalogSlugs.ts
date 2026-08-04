/**
 * One-shot, re-runnable catalog slug migration + 308 redirect backfill.
 *
 * Why
 * ---
 * A large part of the live taxonomy shipped with vowel-less transliterations —
 * `vrgh-grm`, `shyralat-snaty`, `flnj-v-atsalat`, `prvfyl-snaty`. A Persian
 * buyer searches «قیمت ورق گرم»; `vrgh-grm` matches no phrase a human ever
 * types, so those URLs carry none of the keyword signal the whole SSR/ISR
 * catalog exists to capture. This renames them to readable transliterations
 * (`varagh-garm`, `shiralat-sanati`, `flanj-va-etesalat`, `profil-sanati`).
 *
 * Slugs live in the DATABASE, not in code — no route file, component or fixture
 * references any of them (verified by grep). So this is a data migration, and
 * doing it by hand across ~50 rows plus their redirects is exactly how one gets
 * missed.
 *
 * Ranking safety
 * --------------
 * Every URL that changes gets a row in `redirects` (permanent = 308), which
 * `middleware.ts` already enforces on every public-host request, ahead of
 * route matching. Old URL → 308 → new URL. Nothing is dropped: the affected
 * paths are derived FROM the database (categories, their sub-categories, and
 * any SKU underneath), never from an assumption about what exists.
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/renameCatalogSlugs.ts --dry-run
 *
 * Idempotent: a slug already renamed is skipped, and a redirect whose
 * `from_path` already exists is left alone (the column is unique).
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ulid } from 'ulid';

import * as schema from '../src/lib/server/db/schema';
import { categories, subCategories, skus, redirects } from '../src/lib/server/db/schema';

/* --------------------------------------------------------------------- *
 * The map. Persian name → readable Latin transliteration of that name,
 * i.e. what a human would type. Left side is the slug currently in the DB.
 * --------------------------------------------------------------------- */

/** category slug → new category slug */
const CATEGORY_RENAMES: Record<string, string> = {
  'vrgh-grm': 'varagh-garm', //             ورق گرم
  'vrgh-srd': 'varagh-sard', //             ورق سرد
  'vrgh-astyl': 'varagh-steel', //          ورق استیل
  astyl: 'steel', //                        استیل
  'shyralat-snaty': 'shiralat-sanati', //   شیرآلات صنعتی
  'atsalat-flzy': 'etesalat-felezi', //     اتصالات فلزی
  'flnj-v-atsalat': 'flanj-va-etesalat', // فلنج و اتصالات
  'flzat-rngy': 'felezat-rangi', //         فلزات رنگی
};

/** CURRENT category slug → (current sub slug → new sub slug) */
const SUB_RENAMES: Record<string, Record<string, string>> = {
  'angle-channel': {
    'navdany-arvpayy': 'navdani-oroupaei', //  ناودانی اروپایی
    'navdany-astyl': 'navdani-steel', //       ناودانی استیل
    'navdany-sakhtmany': 'navdani-sakhtemani', // ناودانی ساختمانی
    nbshy: 'nabshi', //                        نبشی
    'nbshy-astyl': 'nabshi-steel', //          نبشی استیل
    spry: 'separi', //                         سپری
    'val-pst': 'val-post', //                  وال پست
  },
  astyl: {
    'lvlh-astyl': 'lule-steel', //             لوله استیل
    'nbshy-v-navdany-astyl': 'nabshi-va-navdani-steel', // نبشی و ناودانی استیل
    'prvfyl-astyl': 'profil-steel', //         پروفیل استیل
    'vrgh-astyl': 'varagh-steel', //           ورق استیل
  },
  'flzat-rngy': {
    alvmynyvm: 'aluminium', //                 آلومینیوم
    ms: 'mes', //                              مس
  },
  ibeam: {
    'hash-sbk': 'hash-sabok', //               هاش سبک
    'hash-sngyn': 'hash-sangin', //            هاش سنگین
    'lanh-znbvry': 'lane-zanburi', //          لانه زنبوری
    tyrahn: 'tirahan', //                      تیرآهن
  },
  pipe: {
    'lvlh-api': 'lule-api', //                 لوله API
    'lvlh-aspyral': 'lule-espiral', //         لوله اسپیرال
    'lvlh-astyl': 'lule-steel', //             لوله استیل
    'tkhth-rvsy': 'takhte-rusi', //            تخته روسی
  },
  profile: {
    'prvfyl-astyl': 'profil-steel', //         پروفیل استیل
    'prvfyl-galvanyzh': 'profil-galvanizeh', //پروفیل گالوانیزه
    'prvfyl-mbly': 'profil-mobli', //          پروفیل مبلی
    'prvfyl-sakhtmany': 'profil-sakhtemani', //پروفیل ساختمانی
    'prvfyl-snaty': 'profil-sanati', //        پروفیل صنعتی
    'prvfyl-stvny': 'profil-sotuni', //        پروفیل ستونی
    'prvfyl-z': 'profil-z', //                 پروفیل Z
  },
  rebar: {
    khamvt: 'khamut', //                       خاموت
  },
  'vrgh-astyl': {
    'vrgh-astyl': 'varagh-steel', //           ورق استیل
    'vrgh-astyl-snaty': 'varagh-steel-sanati', // ورق استیل صنعتی
  },
  'vrgh-grm': {
    tsmh: 'tasme', //                          تسمه
    'vrgh-a516': 'varagh-a516', //             ورق A516
    'vrgh-ajdar': 'varagh-ajdar', //           ورق آجدار
    'vrgh-asydshvyy': 'varagh-asidshuei', //   ورق اسیدشویی
    'vrgh-ck45': 'varagh-ck45', //             ورق CK45
    'vrgh-st52': 'varagh-st52', //             ورق ST52
    'vrgh-syah': 'varagh-siah', //             ورق سیاه
  },
  'vrgh-srd': {
    'sandvych-panl': 'sandevich-panel', //     ساندویچ پانل
    'vrgh-arshh-fvlady': 'varagh-arsheh-fouladi', // ورق عرشه فولادی
    'vrgh-galvanyzh': 'varagh-galvanizeh', //  ورق گالوانیزه
    'vrgh-krkrh': 'varagh-korkoreh', //        ورق کرکره
    'vrgh-rngy': 'varagh-rangi', //            ورق رنگی
    'vrgh-rvghny': 'varagh-roghani', //        ورق روغنی
    'vrgh-shyrvany': 'varagh-shirvani', //     ورق شیروانی
  },
};

const DRY_RUN = process.argv.includes('--dry-run');
const log = (m: string) => console.log(`[slugs]${DRY_RUN ? ' (dry-run)' : ''} ${m}`);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[slugs] DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  // Snapshot the CURRENT tree first. Every old path is derived from real rows,
  // so nothing is redirected that never existed and nothing that existed is
  // missed.
  const catRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const subRows = await db
    .select({ id: subCategories.id, slug: subCategories.slug, catId: subCategories.categoryId })
    .from(subCategories);
  const skuRows = await db
    .select({ slug: skus.slug, catId: skus.categoryId, subId: skus.subCategoryId })
    .from(skus);

  const catById = new Map(catRows.map((c) => [c.id, c.slug]));
  const subById = new Map(subRows.map((s) => [s.id, s.slug]));

  const newCatSlug = (slug: string) => CATEGORY_RENAMES[slug] ?? slug;
  const newSubSlug = (catSlug: string, subSlug: string) =>
    SUB_RENAMES[catSlug]?.[subSlug] ?? subSlug;

  /* ---- 1. collect every path whose URL changes ---- */
  const moves: Array<{ from: string; to: string }> = [];
  const push = (from: string, to: string) => {
    if (from !== to) moves.push({ from, to });
  };

  for (const c of catRows) push(`/prices/${c.slug}`, `/prices/${newCatSlug(c.slug)}`);
  for (const s of subRows) {
    const catSlug = catById.get(s.catId);
    if (!catSlug) continue;
    push(
      `/prices/${catSlug}/${s.slug}`,
      `/prices/${newCatSlug(catSlug)}/${newSubSlug(catSlug, s.slug)}`,
    );
  }
  for (const k of skuRows) {
    const catSlug = catById.get(k.catId);
    const subSlug = subById.get(k.subId);
    if (!catSlug || !subSlug) continue;
    push(
      `/prices/${catSlug}/${subSlug}/${k.slug}`,
      `/prices/${newCatSlug(catSlug)}/${newSubSlug(catSlug, subSlug)}/${k.slug}`,
    );
  }

  log(`${moves.length} URLs change (${Object.keys(CATEGORY_RENAMES).length} categories, ` +
      `${Object.values(SUB_RENAMES).reduce((n, m) => n + Object.keys(m).length, 0)} sub-categories)`);

  /* ---- 2. sanity: no rename may collide with a sibling that already exists ---- */
  const catTargets = new Set<string>();
  for (const c of catRows) {
    const t = newCatSlug(c.slug);
    if (catTargets.has(t)) throw new Error(`category slug collision on "${t}"`);
    catTargets.add(t);
  }
  for (const c of catRows) {
    const seen = new Set<string>();
    for (const s of subRows.filter((x) => x.catId === c.id)) {
      const t = newSubSlug(c.slug, s.slug);
      if (seen.has(t)) throw new Error(`sub-category slug collision on "${c.slug}/${t}"`);
      seen.add(t);
    }
  }
  log('collision check passed');

  if (DRY_RUN) {
    for (const m of moves) log(`  ${m.from}  →  ${m.to}`);
    await pool.end();
    return;
  }

  /* ---- 3. apply, in one transaction ---- */
  let renamedCats = 0;
  let renamedSubs = 0;
  let newRedirects = 0;

  await db.transaction(async (tx) => {
    // Sub-categories first: their rename map is keyed on the CURRENT category
    // slug, so renaming the category first would lose the key.
    for (const s of subRows) {
      const catSlug = catById.get(s.catId);
      if (!catSlug) continue;
      const target = newSubSlug(catSlug, s.slug);
      if (target === s.slug) continue;
      await tx
        .update(subCategories)
        .set({ slug: target }) // sub_categories has no updated_at column
        .where(eq(subCategories.id, s.id));
      renamedSubs++;
    }
    for (const c of catRows) {
      const target = newCatSlug(c.slug);
      if (target === c.slug) continue;
      await tx
        .update(categories)
        .set({ slug: target, updatedAt: new Date() })
        .where(eq(categories.id, c.id));
      renamedCats++;
    }

    // Redirects last, so a failure above rolls everything back together and we
    // never end up with redirects pointing at slugs that were not renamed.
    for (const m of moves) {
      const existing = await tx
        .select({ id: redirects.id })
        .from(redirects)
        .where(eq(redirects.fromPath, m.from))
        .limit(1);
      if (existing[0]) continue; // idempotent re-run, or an admin-made rule wins
      await tx.insert(redirects).values({
        id: ulid(),
        fromPath: m.from,
        toPath: m.to,
        permanent: true, // 308 — see redirectsRepo on why not a literal 301
      });
      newRedirects++;
    }
  });

  log(`renamed ${renamedCats} categories, ${renamedSubs} sub-categories`);
  log(`inserted ${newRedirects} permanent (308) redirects`);

  // Guard against a redirect pointing at a path that does not exist any more.
  const after = await db
    .select({ from: redirects.fromPath, to: redirects.toPath })
    .from(redirects);
  const live = new Set<string>();
  const catAfter = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const subAfter = await db
    .select({ slug: subCategories.slug, catId: subCategories.categoryId })
    .from(subCategories);
  const catSlugAfter = new Map(catAfter.map((c) => [c.id, c.slug]));
  for (const c of catAfter) live.add(`/prices/${c.slug}`);
  for (const s of subAfter) {
    const cs = catSlugAfter.get(s.catId);
    if (cs) live.add(`/prices/${cs}/${s.slug}`);
  }
  const dangling = after.filter((r) => r.to.startsWith('/prices/') && !live.has(r.to) && r.to.split('/').length === 4);
  if (dangling.length) {
    log(`WARNING: ${dangling.length} redirect target(s) no longer resolve:`);
    for (const d of dangling) log(`  ${d.from} → ${d.to}`);
  } else {
    log('every category/sub redirect target resolves to a live row');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[slugs] failed:', err);
  process.exit(1);
});

export { CATEGORY_RENAMES, SUB_RENAMES };
