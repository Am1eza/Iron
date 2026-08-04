/**
 * Re-runnable repair for a half-finished taxonomy rename (W29 audit §1).
 *
 * Why
 * ---
 * Someone created a second, Persian-transliterated sub-category next to each
 * English-slugged original, deactivated the original, and never moved the SKUs.
 * Every public read path filters `sub_categories.is_active` (catalogRepo:
 * tableRows / findSkuRow / searchSkus / publicCatalogPaths), so the products
 * behind the deactivated rows are invisible site-wide: 119 active SKUs sitting
 * on deactivated sub-categories of ACTIVE categories.
 *
 * This moves those SKUs onto the live twin, leaves the emptied source row in
 * place but deactivated (never deleted — `isActive=false` is this schema's
 * delete, see the header of db/schema/catalog.ts), and backfills a 308 for
 * every URL that was once live under the old sub-category slug.
 *
 * Scope discipline
 * ----------------
 * ONLY unambiguous 1:1 pairs are listed in `MOVES` below. A deactivated
 * sub-category is deliberately left alone — its SKUs stay invisible — when it
 * has no plausible live twin, when two live twins are equally plausible, or
 * when another deactivated sibling has an equal claim on the same twin. See
 * `DELIBERATELY_UNMAPPED` for the full list and the reason for each. Putting a
 * product under the wrong sub-category on a live storefront is worse than
 * leaving it missing, and picking a winner between two plausible twins is the
 * owner's call, not a script's.
 *
 * The `sheet` category (whole category `is_active=false`, 48 SKUs) is out of
 * scope entirely: that is not a half-finished migration, it is a question about
 * whether the owner sells sheet.
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/remapStrandedSubCategories.ts --dry-run
 *   … then re-run with --apply.
 *
 * Idempotent: once the SKUs have moved, the source holds zero and every step
 * is skipped; `redirects.from_path` is unique and an existing row is left
 * alone (an admin-made rule must win over this script).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ulid } from 'ulid';

import * as schema from '../src/lib/server/db/schema';
import { categories, subCategories, skus, redirects } from '../src/lib/server/db/schema';

type Move = {
  /** Parent category slug. The move never crosses a category. */
  category: string;
  /** Deactivated sub-category slug currently holding the SKUs. */
  from: string;
  /** Live, empty sub-category slug the SKUs belong on. */
  to: string;
  /** Why this pair is safe — printed by --dry-run so a human can check it. */
  why: string;
};

/**
 * Every pair here satisfies all of: same parent category · target is active ·
 * target holds zero SKUs · the source's Persian display name IS the target's
 * Persian display name (modulo a parenthetical standard code, a ZWNJ, or the
 * category word the target prefixes) · no other deactivated sibling has an
 * equal claim on that target. Anything failing one of those is in
 * DELIBERATELY_UNMAPPED instead.
 */
const MOVES: Move[] = [
  // ── angle-channel ────────────────────────────────────────────────────────
  {
    category: 'angle-channel',
    from: 'angle', //   نبشی بال مساوی  (7 SKUs)
    to: 'nabshi', //    نبشی
    why: 'unqualified «نبشی» is equal-leg angle; the two other نبشی-ish sources carry an explicit qualifier (بال نامساوی / لقمه) and stay put',
  },
  {
    category: 'angle-channel',
    from: 'tbar', //    سپری  (5 SKUs)
    to: 'separi', //    سپری
    why: 'identical display name; `separi` is literally the transliteration of سپری',
  },
  // ── ibeam ────────────────────────────────────────────────────────────────
  {
    category: 'ibeam',
    from: 'hea', //          هاش سبک (HEA)  (6 SKUs)
    to: 'hash-sabok', //     هاش سبک
    why: 'identical name plus the standard code in parentheses',
  },
  {
    category: 'ibeam',
    from: 'heb', //          هاش سنگین (HEB)  (6 SKUs)
    to: 'hash-sangin', //    هاش سنگین
    why: 'identical name plus the standard code in parentheses',
  },
  {
    category: 'ibeam',
    from: 'castellated', //  لانه‌زنبوری  (4 SKUs)
    to: 'lane-zanburi', //   لانه زنبوری
    why: 'same name, ZWNJ vs. space only',
  },
  {
    category: 'ibeam',
    from: 'ipe', //          IPE  (4 SKUs)
    to: 'tirahan', //        تیرآهن
    why: 'IPE is the canonical تیرآهن profile and `tirahan` is the only candidate; the one competing source («سبک») is itself ambiguous and stays put',
  },
  // ── profile ──────────────────────────────────────────────────────────────
  {
    category: 'profile',
    from: 'z', //                  پروفیل Z  (7 SKUs)
    to: 'profil-z', //             پروفیل Z
    why: 'identical display name',
  },
  {
    category: 'profile',
    from: 'furniture', //          مبلی  (5 SKUs)
    to: 'profil-mobli', //         پروفیل مبلی
    why: 'target = «پروفیل» + the source name; no competing source in this category',
  },
  {
    category: 'profile',
    from: 'galvanized', //         گالوانیزه  (5 SKUs)
    to: 'profil-galvanizeh', //    پروفیل گالوانیزه
    why: 'target = «پروفیل» + the source name; no competing source in this category',
  },
  {
    category: 'profile',
    from: 'column', //             ستونی ۱۳۵  (6 SKUs)
    to: 'profil-sotuni', //        پروفیل ستونی
    why: 'target = «پروفیل» + the source name; the ۱۳۵ in the source name is the size spec, not a distinct family',
  },
  // ── rebar ────────────────────────────────────────────────────────────────
  {
    category: 'rebar',
    from: 'stirrup', //  خاموت  (7 SKUs)
    to: 'khamut', //     خاموت
    why: 'identical display name; `khamut` is literally the transliteration of خاموت',
  },
];

/**
 * Left stranded ON PURPOSE. Each of these keeps its SKUs invisible until the
 * owner decides. Documented here rather than in a commit message so the next
 * run of --dry-run prints the reasoning next to the mapping it did apply.
 */
const DELIBERATELY_UNMAPPED: Array<{ category: string; sub: string; reason: string }> = [
  {
    category: 'angle-channel',
    sub: 'angle-unequal', // نبشی بال نامساوی, 5 SKUs
    reason: 'its only candidate twin is `nabshi` (نبشی), which `angle` (نبشی بال مساوی) has the stronger claim on; merging both would silently drop the equal/unequal distinction',
  },
  {
    category: 'angle-channel',
    sub: 'channel-heavy', // ناودانی سنگین, 6 SKUs
    reason: 'two equally plausible twins — `navdani-oroupaei` (ناودانی اروپایی) and `navdani-sakhtemani` (ناودانی ساختمانی). Picking one is a product decision',
  },
  {
    category: 'angle-channel',
    sub: 'channel-light', // ناودانی سبک, 4 SKUs
    reason: 'same two candidates as channel-heavy, and whichever one takes heavy determines this one',
  },
  {
    category: 'angle-channel',
    sub: 'spot', // نبشی لقمه, 5 SKUs
    reason: 'no live sub-category corresponds to لقمه at all',
  },
  {
    category: 'ibeam',
    sub: 'light', // سبک, 5 SKUs
    reason: '«سبک» alone is ambiguous between `hash-sabok` (هاش سبک) and `tirahan` (تیرآهن سبک)',
  },
  {
    category: 'profile',
    sub: 'box-square', // قوطی مربع, 6 SKUs
    reason: 'قوطی is not named by any live sub-category; `profil-sanati` and `profil-sakhtemani` are both guesses',
  },
  {
    category: 'profile',
    sub: 'box-rect', // قوطی مستطیل, 5 SKUs
    reason: 'same as box-square',
  },
  {
    category: 'profile',
    sub: 'frame', // درب و پنجره, 6 SKUs
    reason: 'درب و پنجره maps to no live name; `profil-sakhtemani` vs `profil-sanati` is a guess',
  },
  {
    category: 'rebar',
    sub: 'alloy', // آلیاژی, 7 SKUs
    reason: 'no live rebar sub-category is آلیاژی',
  },
  {
    category: 'rebar',
    sub: 'coil', // کلاف, 4 SKUs
    reason: 'no live rebar sub-category is کلاف (the کلاف families live under the separate `wire` category)',
  },
  {
    category: 'rebar',
    sub: 'deformed-a2', // آجدار A2, 4 SKUs
    reason: 'the only near-twin `deformed` is آجدار **A3** — a different grade — and it is already active and non-empty, so this is not a rename pair at all',
  },
];

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const log = (m: string) => console.log(`[remap]${DRY_RUN ? ' (dry-run)' : ''} ${m}`);

/** SKUs visible to the public: active SKU, active sub-category, active category. */
async function visibleSkuCount(runner: {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
}): Promise<number> {
  const res = (await runner.execute(sql`
    select count(*)::int as n
    from ${skus} k
    join ${subCategories} s on s.id = k.sub_category_id
    join ${categories} c on c.id = k.category_id
    where k.is_active and s.is_active and c.is_active
  `)) as { rows: Array<{ n: number }> };
  return res.rows[0]?.n ?? 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[remap] DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  const catRows = await db
    .select({ id: categories.id, slug: categories.slug, isActive: categories.isActive })
    .from(categories);
  const subRows = await db
    .select({
      id: subCategories.id,
      slug: subCategories.slug,
      name: subCategories.name,
      catId: subCategories.categoryId,
      isActive: subCategories.isActive,
    })
    .from(subCategories);
  const skuRows = await db
    .select({
      id: skus.id,
      slug: skus.slug,
      subId: skus.subCategoryId,
      catId: skus.categoryId,
      isActive: skus.isActive,
    })
    .from(skus);

  const catBySlug = new Map(catRows.map((c) => [c.slug, c]));
  const skusBySub = new Map<string, typeof skuRows>();
  for (const k of skuRows) {
    const list = skusBySub.get(k.subId) ?? [];
    list.push(k);
    skusBySub.set(k.subId, list);
  }

  const before = await visibleSkuCount(db);
  log(`publicly visible SKUs BEFORE: ${before}`);

  /* ---- 1. pre-flight: every assertion, before a single write ---- */
  type Plan = Move & {
    fromId: string;
    toId: string;
    catId: string;
    fromName: string;
    toName: string;
    moving: typeof skuRows;
    alreadyDone: boolean;
  };
  const plans: Plan[] = [];

  for (const m of MOVES) {
    const cat = catBySlug.get(m.category);
    if (!cat) throw new Error(`pre-flight: category "${m.category}" does not exist`);
    if (!cat.isActive) throw new Error(`pre-flight: category "${m.category}" is not active`);

    const src = subRows.find((s) => s.catId === cat.id && s.slug === m.from);
    const dst = subRows.find((s) => s.catId === cat.id && s.slug === m.to);
    if (!src) throw new Error(`pre-flight: ${m.category}/${m.from} (source) does not exist`);
    if (!dst) throw new Error(`pre-flight: ${m.category}/${m.to} (target) does not exist`);
    // Same parent category is guaranteed by the two lookups above being keyed
    // on the same cat.id — assert it anyway, cheaply, so a future refactor of
    // the lookup cannot silently start moving SKUs across categories.
    if (src.catId !== dst.catId) throw new Error(`pre-flight: ${m.from} → ${m.to} crosses categories`);
    if (!dst.isActive) throw new Error(`pre-flight: target ${m.category}/${m.to} is not active`);
    if (src.id === dst.id) throw new Error(`pre-flight: ${m.category}/${m.from} maps to itself`);

    const inSrc = skusBySub.get(src.id) ?? [];
    const inDst = skusBySub.get(dst.id) ?? [];

    // The target must be empty — that is the signal that identifies it as the
    // never-populated half of the abandoned rename. On a re-run the source is
    // empty instead and the target holds exactly what we moved, which is the
    // no-op state; anything else means the taxonomy changed under us.
    const alreadyDone = inSrc.length === 0;
    if (!alreadyDone && inDst.length > 0) {
      throw new Error(
        `pre-flight: target ${m.category}/${m.to} already holds ${inDst.length} SKU(s) — ` +
          `it is not the empty half of a rename; refusing to merge`,
      );
    }
    if (alreadyDone) {
      log(`SKIP ${m.category}/${m.from} → ${m.to} — source already empty (previous run)`);
    }

    // SKU slugs are globally unique (skus.slug UNIQUE) so a move can never
    // collide; assert the invariant rather than assume it.
    const dstSlugs = new Set(inDst.map((k) => k.slug));
    for (const k of inSrc) {
      if (dstSlugs.has(k.slug)) throw new Error(`pre-flight: SKU slug collision on "${k.slug}"`);
      if (k.catId !== cat.id) {
        throw new Error(`pre-flight: SKU "${k.slug}" has category_id ${k.catId}, expected ${cat.id}`);
      }
    }

    plans.push({
      ...m,
      fromId: src.id,
      toId: dst.id,
      catId: cat.id,
      fromName: src.name,
      toName: dst.name,
      moving: inSrc,
      alreadyDone,
    });
  }
  log(`pre-flight passed for ${plans.length} pair(s)`);

  /* ---- 2. the redirect set: every URL that was live under the old slug ---- */
  const wantedRedirects: Array<{ from: string; to: string }> = [];
  for (const p of plans) {
    wantedRedirects.push({
      from: `/prices/${p.category}/${p.from}`,
      to: `/prices/${p.category}/${p.to}`,
    });
    // SKU URLs are derived from the rows actually being moved — on a re-run
    // the source is empty, so re-derive from the target instead, keeping the
    // redirect set identical between runs.
    const source = p.alreadyDone ? (skusBySub.get(p.toId) ?? []) : p.moving;
    for (const k of source) {
      wantedRedirects.push({
        from: `/prices/${p.category}/${p.from}/${k.slug}`,
        to: `/prices/${p.category}/${p.to}/${k.slug}`,
      });
    }
  }

  const existing = new Set(
    (await db.select({ from: redirects.fromPath }).from(redirects)).map((r) => r.from),
  );
  const newRedirects = wantedRedirects.filter((r) => !existing.has(r.from));

  /* ---- 3. report ---- */
  const totalMoving = plans.reduce((n, p) => n + p.moving.filter((k) => k.isActive).length, 0);
  log('');
  log('mapping:');
  for (const p of plans) {
    log(
      `  ${p.category}/${p.from} («${p.fromName}») → ${p.category}/${p.to} («${p.toName}») ` +
        `· ${p.moving.length} SKU(s)`,
    );
    log(`      ${p.why}`);
  }
  log('');
  log('deliberately NOT mapped (SKUs stay hidden, owner decision):');
  for (const u of DELIBERATELY_UNMAPPED) {
    const cat = catBySlug.get(u.category);
    const sub = cat ? subRows.find((s) => s.catId === cat.id && s.slug === u.sub) : undefined;
    const n = sub ? (skusBySub.get(sub.id) ?? []).length : 0;
    log(`  ${u.category}/${u.sub} · ${n} SKU(s) — ${u.reason}`);
  }
  log('');
  log(`${totalMoving} active SKU(s) to move · ${newRedirects.length} new 308 redirect(s)`);
  log(`publicly visible SKUs: ${before} → ${before + totalMoving} (expected)`);

  if (DRY_RUN) {
    for (const r of newRedirects) log(`  308  ${r.from}  →  ${r.to}`);
    log('dry run — nothing written. Re-run with --apply.');
    await pool.end();
    return;
  }

  /* ---- 4. apply, in one transaction ---- */
  let moved = 0;
  let retired = 0;
  let inserted = 0;

  await db.transaction(async (tx) => {
    for (const p of plans) {
      if (p.moving.length > 0) {
        const ids = p.moving.map((k) => k.id);
        await tx
          .update(skus)
          .set({ subCategoryId: p.toId, updatedAt: new Date() })
          // category_id is deliberately NOT touched: the move never crosses a
          // category, and pre-flight already asserted every row matches.
          .where(and(inArray(skus.id, ids), eq(skus.subCategoryId, p.fromId)));
        moved += ids.length;
      }

      // Retire the emptied source — deactivate, never delete. It is already
      // inactive today; setting it explicitly makes the script correct even if
      // someone re-activates the row before a re-run, and keeps the row (and
      // therefore its price history and any FK pointing at it) intact.
      const src = subRows.find((s) => s.id === p.fromId);
      if (src?.isActive) {
        await tx.update(subCategories).set({ isActive: false }).where(eq(subCategories.id, p.fromId));
        retired++;
      }
    }

    // Redirects last, so a failure above rolls back with them and we never
    // leave a 308 pointing at a page whose SKUs did not move.
    for (const r of newRedirects) {
      const dup = await tx
        .select({ id: redirects.id })
        .from(redirects)
        .where(eq(redirects.fromPath, r.from))
        .limit(1);
      if (dup[0]) continue;
      await tx.insert(redirects).values({
        id: ulid(),
        fromPath: r.from,
        toPath: r.to,
        permanent: true, // 308 — middleware.ts maps permanent→308
      });
      inserted++;
    }
  });

  log(`moved ${moved} SKU(s), retired ${retired} source sub-category row(s), inserted ${inserted} redirect(s)`);

  /* ---- 5. verify from the database, not from the counters above ---- */
  const after = await visibleSkuCount(db);
  log(`publicly visible SKUs AFTER: ${after}  (delta ${after - before})`);

  const stranded = await db.execute(sql`
    select c.slug as cat, s.slug as sub, count(*)::int as n
    from ${skus} k
    join ${subCategories} s on s.id = k.sub_category_id
    join ${categories} c on c.id = k.category_id
    where k.is_active and not s.is_active and c.is_active
    group by 1, 2 order by 1, 2
  `);
  const rows = (stranded as unknown as { rows: Array<{ cat: string; sub: string; n: number }> }).rows;
  log(`still stranded on deactivated sub-categories of active categories: ${rows.reduce((n, r) => n + r.n, 0)} SKU(s)`);
  for (const r of rows) log(`  ${r.cat}/${r.sub} · ${r.n}`);

  // No redirect may point at a sub-category page that does not resolve.
  const live = new Set<string>();
  for (const s of subRows) {
    const c = catRows.find((x) => x.id === s.catId);
    if (c) live.add(`/prices/${c.slug}/${s.slug}`);
  }
  const dangling = wantedRedirects.filter((r) => r.to.split('/').length === 4 && !live.has(r.to));
  if (dangling.length) {
    log(`WARNING: ${dangling.length} redirect target(s) do not resolve:`);
    for (const d of dangling) log(`  ${d.from} → ${d.to}`);
  } else {
    log('every sub-category redirect target resolves to a live row');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[remap] failed:', err);
  process.exit(1);
});

export { MOVES, DELIBERATELY_UNMAPPED };
