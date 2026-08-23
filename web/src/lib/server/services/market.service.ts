/**
 * Market service — the poll-job bodies. Two independent feeds, one function
 * each, deliberately not merged: they have different upstreams, different
 * cadences (60s vs 15 min) and different failure blast radii.
 *
 * - `refreshMarket()` — tgju (usd/eur/gold18/ounce).
 * - `refreshBillet()` — esfahanahan (billet / شمش فولاد). Was admin-entered
 *   only until 1405/06/01; see integrations/esfahanahan.ts for why it isn't.
 *
 * Both upsert values + history, and on outage flag only THEIR OWN source's
 * rows stale, so the ticker serves last-known values with the outage badge
 * (AC-A-2) without one feed's downtime mislabelling the other's numbers.
 */
import { fetchTgju } from '@/lib/server/integrations/tgju';
import { fetchBilletPrice } from '@/lib/server/integrations/esfahanahan';
import { upsertMarketValue, flagSourceStale, getMarketValue } from '@/lib/server/repos/marketRepo';
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
    if (process.env.TGJU_BASE_URL) await flagSourceStale('tgju');
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

/**
 * How long a hand-entered billet price (`PUT /api/admin/market/billet`) wins
 * over the feed. Without this the admin route would be decorative: the owner
 * types a number off a phone call and the next poll silently reverts it
 * minutes later, with no error and no trace.
 *
 * Bounded, not permanent, precisely because "billet is whatever a human last
 * typed" is the failure this automation exists to end — after the hold the
 * feed takes back over on its own, so a forgotten override can go stale by at
 * most this long instead of indefinitely. 6h ≈ one working day's half, and the
 * source itself only reprices a few times a day. `BILLET_ADMIN_HOLD_HOURS=0`
 * disables the hold entirely (feed always wins).
 */
function adminHoldMs(): number {
  const raw = Number(process.env.BILLET_ADMIN_HOLD_HOURS);
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : 6;
  return hours * 60 * 60 * 1000;
}

export type BilletRefresh =
  | { status: 'updated'; value: number }
  | { status: 'held'; value: number }
  | { status: 'stale' };

/**
 * Poll esfahanahan for شمش فولاد and store it as the `billet` ticker value.
 *
 * Outage → `flagSourceStale('esfahanahan')`: the last-known number keeps
 * serving with the «با تأخیر» badge, exactly as a tgju outage behaves. An
 * outage is NOT allowed to touch an `admin`-sourced row — if the owner typed
 * the current number by hand, the feed being down says nothing about it.
 */
export async function refreshBillet(now = new Date()): Promise<BilletRefresh> {
  const current = await getMarketValue('billet');
  const hold = adminHoldMs();
  if (current && current.source === 'admin' && hold > 0 && now.getTime() - current.updatedAt.getTime() < hold) {
    return { status: 'held', value: current.value };
  }

  const value = await fetchBilletPrice(now);
  if (value === null) {
    // Only badge our own feed's row. A row still sitting on a manual override
    // isn't stale just because esfahanahan is unreachable.
    if (!current || current.source === 'esfahanahan') await flagSourceStale('esfahanahan');
    return { status: 'stale' };
  }

  await upsertMarketValue({
    key: 'billet',
    value,
    label: 'شمش فولاد',
    unit: 'تومان',
    source: 'esfahanahan',
  });
  return { status: 'updated', value };
}
