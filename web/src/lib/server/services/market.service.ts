/**
 * Market service — the poll-job body. Fetches tgju (usd/eur/gold18/ounce),
 * upserts values + history; on outage flags tgju rows stale so the ticker
 * serves last-known values with the outage badge (AC-A-2). Billet is
 * admin-entered and never touched here.
 */
import { fetchTgju } from '@/lib/server/integrations/tgju';
import { upsertMarketValue, flagTgjuStale } from '@/lib/server/repos/marketRepo';
import type { MarketKey } from '@/lib/types/domain';

const LABELS: Record<Exclude<MarketKey, 'billet'>, { label: string; unit: string }> = {
  usd: { label: 'دلار', unit: 'تومان' },
  eur: { label: 'یورو', unit: 'تومان' },
  gold18: { label: 'طلای ۱۸', unit: 'تومان' },
  ounce: { label: 'انس جهانی', unit: 'دلار' },
};

export async function refreshMarket(): Promise<{ updated: number; stale: boolean }> {
  const data = await fetchTgju();
  if (!data) {
    if (process.env.TGJU_BASE_URL) await flagTgjuStale();
    return { updated: 0, stale: Boolean(process.env.TGJU_BASE_URL) };
  }
  let updated = 0;
  for (const [key, meta] of Object.entries(LABELS) as [Exclude<MarketKey, 'billet'>, { label: string; unit: string }][]) {
    const value = data[key];
    if (typeof value === 'number' && value > 0) {
      await upsertMarketValue({ key, value, label: meta.label, unit: meta.unit, source: 'tgju' });
      updated++;
    }
  }
  return { updated, stale: false };
}
