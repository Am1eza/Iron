/**
 * The automated price mirror (US-02.5) — fetch ahanonline's current prices,
 * match them to our SKUs, and write the confident ones straight into
 * `current_prices`.
 *
 * There is deliberately no draft/approval step: the owner chose a live mirror
 * over a staged rollout and accepted responsibility for catching early
 * mistakes. What this file owes him in return is that catching a mistake is
 * actually possible — so every SKU the job looks at produces a
 * `price_sync_entries` row, whether it was written or skipped, carrying the
 * old price, the new price, the competitor row it came from and the reason.
 *
 * Two invariants this file must never lose:
 *
 * 1. **It writes through `savePrice`, never through raw SQL.** That is the
 *    single price write path (movement% vs. yesterday's close, the append to
 *    `price_points`, the audit row, `is_stale=false`). A mirrored price is a
 *    real price and has to look like one everywhere — a direct UPDATE would
 *    have left it stale-flagged and absent from every chart.
 * 2. **A weak match is a skip, not a guess.** See `priceSync.match.ts`.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, currentPrices, skus, subCategories } from '@/lib/server/db/schema';
import { fetchAhanonlinePrices, type FetchOptions } from '@/lib/server/integrations/ahanonline';
import {
  matchSku,
  SKIP_REASONS,
  SOURCE_PATHS,
  taxonomyKey,
  type MatchableSku,
  type MatchConfig,
} from './priceSync.match';
import { savePrices } from './pricing.service';
import {
  createSyncRun,
  finishSyncRun,
  insertSyncEntries,
  type NewSyncEntry,
} from '@/lib/server/repos/priceSyncRepo';
import { getPriceSyncConfig, type PriceSyncConfig } from '@/lib/server/repos/settingsRepo';
import { jalaliDayKey } from '@/lib/server/utils/jalali';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { reportError } from '@/lib/errors/report';

const SOURCE = 'ahanonline' as const;

export interface RunPriceSyncOptions {
  trigger?: 'cron' | 'manual';
  /** Manual runs bypass the `enabled` kill switch — the operator is present. */
  force?: boolean;
  /** Injected in tests; forwarded to the fetcher so nothing hits the network. */
  fetch?: FetchOptions;
  now?: Date;
}

export interface PriceSyncSummary {
  runId: string | null;
  status: 'ok' | 'failed' | 'disabled' | 'busy';
  sourceRows: number;
  pagesFetched: number;
  fetchFailures: Array<{ path: string; error: string }>;
  consideredSkus: number;
  written: number;
  skipped: number;
  /** Skip counts by reason code — the "why did nothing happen?" answer. */
  skipReasons: Record<string, number>;
  error?: string;
}

/** `1405-05-31` → `[1405, 5, 31]` for the source-freshness check. */
function todayJalaliTriple(now: Date): [number, number, number] {
  const [y, m, d] = jalaliDayKey(now).split('-').map(Number);
  return [y!, m!, d!];
}

interface CandidateSku extends MatchableSku {
  excluded: boolean;
  currentPrice: number | null;
}

/**
 * Every active SKU whose sub-category the matcher knows a competitor page for.
 *
 * Scoped in SQL rather than filtered in JS after loading everything so a run
 * does not produce ~250 «no source mapping» log rows for استیل / فلزات رنگی /
 * وال پست twice a day. Those product lines are permanently out of scope, not
 * a per-run outcome, and burying the real skips under them would defeat the
 * point of the log.
 */
async function loadCandidates(config: PriceSyncConfig): Promise<CandidateSku[]> {
  const rows = await getDb()
    .select({
      id: skus.id,
      name: skus.name,
      size: skus.size,
      factory: skus.factory,
      priceBasis: skus.priceBasis,
      excluded: skus.priceSyncExcluded,
      categorySlug: categories.slug,
      subCategorySlug: subCategories.slug,
      currentPrice: currentPrices.price,
    })
    .from(skus)
    .innerJoin(categories, eq(categories.id, skus.categoryId))
    .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(eq(skus.isActive, true));

  const inScope = (r: (typeof rows)[number]) => {
    if (!SOURCE_PATHS[`${r.categorySlug}/${r.subCategorySlug}`]) return false;
    if (config.categorySlugs.length > 0 && !config.categorySlugs.includes(r.categorySlug)) return false;
    return true;
  };
  return rows.filter(inScope) as CandidateSku[];
}

/**
 * Run one mirror pass. Never throws — a failure is recorded on the run row and
 * returned, because the caller is a cron entry whose only other option is an
 * email to root nobody reads.
 */
export async function runPriceSync(opts: RunPriceSyncOptions = {}): Promise<PriceSyncSummary> {
  const trigger = opts.trigger ?? 'cron';
  const now = opts.now ?? new Date();
  const empty: PriceSyncSummary = {
    runId: null,
    status: 'ok',
    sourceRows: 0,
    pagesFetched: 0,
    fetchFailures: [],
    consideredSkus: 0,
    written: 0,
    skipped: 0,
    skipReasons: {},
  };

  const config = await getPriceSyncConfig();
  if (!config.enabled && !opts.force) {
    return { ...empty, status: 'disabled' };
  }

  const runId = await createSyncRun({ source: SOURCE, trigger });
  if (!runId) {
    // Another pass is already in flight (the 08:00 cron overrunning into an
    // admin's manual trigger, say). Two concurrent passes would write the same
    // prices twice and double every log row for no benefit.
    return { ...empty, status: 'busy' };
  }
  try {
    const candidates = await loadCandidates(config);
    // Only fetch pages some in-scope SKU could actually match against.
    const wantedPaths = new Set<string>();
    for (const c of candidates) {
      for (const p of SOURCE_PATHS[taxonomyKey(c)] ?? []) wantedPaths.add(p);
    }
    const { rows, failures, pagesFetched } = await fetchAhanonlinePrices({
      paths: [...wantedPaths],
      ...opts.fetch,
    });

    const matchConfig: MatchConfig = {
      minPriceToman: config.minPriceToman,
      maxPriceToman: config.maxPriceToman,
      maxCandidateSpreadPct: config.maxCandidateSpreadPct,
      maxSourceAgeDays: config.maxSourceAgeDays,
      now,
    };
    const today = todayJalaliTriple(now);

    // ---- decide -----------------------------------------------------------
    const entries: NewSyncEntry[] = [];
    const toWrite: Array<{ skuId: string; price: number; entryIndex: number }> = [];
    const skipReasons: Record<string, number> = {};

    const baseEntry = (sku: CandidateSku): NewSyncEntry => ({
      runId,
      skuId: sku.id,
      outcome: 'skipped',
      reason: '',
      oldPrice: sku.currentPrice,
      newPrice: null,
      source: SOURCE,
      matchedName: null,
      matchedFactory: null,
      matchedCode: null,
      matchedUnit: null,
      sourceUpdatedAt: null,
      confidence: 'none',
    });

    for (const sku of candidates) {
      if (sku.excluded) {
        // The manual override. Checked FIRST, before any matching work, so an
        // opted-out SKU can never be written even if the matcher would have
        // been confident about it.
        entries.push({ ...baseEntry(sku), reason: SKIP_REASONS.excluded });
        skipReasons[SKIP_REASONS.excluded] = (skipReasons[SKIP_REASONS.excluded] ?? 0) + 1;
        continue;
      }

      const result = matchSku(sku, rows, matchConfig, today);
      const evidence: Partial<NewSyncEntry> = {
        confidence: result.confidence,
        matchedName: result.row?.name ?? null,
        matchedFactory: result.factory,
        matchedCode: result.row?.code ?? null,
        matchedUnit: result.unit || null,
        sourceUpdatedAt: result.sourceUpdatedAt,
      };

      if (!result.ok) {
        entries.push({ ...baseEntry(sku), ...evidence, reason: result.reason });
        skipReasons[result.reason] = (skipReasons[result.reason] ?? 0) + 1;
        continue;
      }

      const entryIndex = entries.length;
      entries.push({
        ...baseEntry(sku),
        ...evidence,
        outcome: 'written',
        reason: result.reason,
        newPrice: result.priceToman,
      });
      toWrite.push({ skuId: sku.id, price: result.priceToman, entryIndex });
    }

    // ---- write ------------------------------------------------------------
    // `null` actor: this is a system job, and `savePrice` documents why that
    // is preferable to a synthetic staff account.
    const saveResults = await savePrices(
      null,
      toWrite.map((w) => ({ skuId: w.skuId, price: w.price })),
    );

    let written = 0;
    toWrite.forEach((w, i) => {
      const res = saveResults[i];
      if (res && res.ok) {
        written += 1;
        return;
      }
      // The save itself failed (a SKU deleted mid-run, an invalid price). The
      // log must not claim a write that never landed.
      const entry = entries[w.entryIndex]!;
      entry.outcome = 'skipped';
      entry.reason = 'skip:write-failed';
      entry.newPrice = null;
      skipReasons['skip:write-failed'] = (skipReasons['skip:write-failed'] ?? 0) + 1;
    });

    await insertSyncEntries(entries);

    const skipped = entries.length - written;
    await finishSyncRun(runId, {
      status: 'ok',
      sourceRows: rows.length,
      consideredSkus: candidates.length,
      written,
      skipped,
      error: failures.length > 0 ? `${failures.length} page(s) failed: ${failures.map((f) => `${f.path} (${f.error})`).join('; ')}`.slice(0, 2000) : null,
    });

    if (written > 0) {
      // Same post-save work the admin bulk-save route does: re-evaluate price
      // alerts customers subscribed to, then bust the ISR cache on both pages
      // that render these numbers.
      await evaluateAlerts().catch((err) => reportError(err, { scope: 'priceSync', stage: 'evaluateAlerts' }));
      safeRevalidatePath('/prices', 'layout');
      safeRevalidatePath('/', 'page');
    }

    return {
      runId,
      status: 'ok',
      sourceRows: rows.length,
      pagesFetched,
      fetchFailures: failures,
      consideredSkus: candidates.length,
      written,
      skipped,
      skipReasons,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(err, { scope: 'priceSync', runId });
    await finishSyncRun(runId, { status: 'failed', error: message.slice(0, 2000) }).catch(() => {});
    return { ...empty, runId, status: 'failed', error: message };
  }
}

/** Which of our sub-categories the mirror covers at all — surfaced in the
 *  admin UI so "this category never updates" has a visible answer. */
export async function priceSyncScope(): Promise<
  Array<{ categorySlug: string; categoryName: string; subCategoryName: string; skuCount: number }>
> {
  const rows = await getDb()
    .select({
      categorySlug: categories.slug,
      categoryName: categories.name,
      subCategorySlug: subCategories.slug,
      subCategoryName: subCategories.name,
      skuId: skus.id,
    })
    .from(skus)
    .innerJoin(categories, eq(categories.id, skus.categoryId))
    .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
    .where(and(eq(skus.isActive, true), eq(skus.priceBasis, 'kg')));

  const counts = new Map<string, { categorySlug: string; categoryName: string; subCategoryName: string; skuCount: number }>();
  for (const r of rows) {
    const key = `${r.categorySlug}/${r.subCategorySlug}`;
    if (!SOURCE_PATHS[key]) continue;
    const hit = counts.get(key);
    if (hit) hit.skuCount += 1;
    else
      counts.set(key, {
        categorySlug: r.categorySlug,
        categoryName: r.categoryName,
        subCategoryName: r.subCategoryName,
        skuCount: 1,
      });
  }
  return [...counts.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'fa'));
}
