/**
 * The pricing (audit C) and order/warehouse (audit E) integrity gates, given
 * the same shape `catalogIntegrityAudit.ts` already gave the catalog one.
 *
 * WHY. Both audits closed their findings with a script — `pnpm audit:pricing`
 * and `pnpm audit:orders` — and both then had to record the same gap in their
 * own conclusions: audit C's «`pnpm audit:pricing` (اسکریپت تازه) هنوز داخل
 * image تولیدی باندل نشده، پس با همان ۷ query معادل مستقیماً روی SQL واقعی
 * اجرا شد، نه از طریق خودِ اسکریپت». A gate nobody can run where it matters
 * is not a gate; a gate that must be run by hand is one nobody runs twice.
 *
 * Bundling the scripts into the production image would answer the letter of
 * that, but not the spirit — it would still take a person remembering. The
 * catalog audit already solved this class of problem the better way: put the
 * checks in a service, let the CLI and a daily `Job` share it, and report
 * failures through the same GlitchTip path as every other job. This does that
 * for the other two.
 *
 * The check SQL below is copied verbatim from the two scripts. This file is
 * their one home now, so the manual run a human does after a migration and
 * the unattended run that watches production cannot drift apart.
 */

export interface IntegrityCheck {
  name: string;
  sql: string;
}

/** Minimal shape both `pg.Pool` and a plain query function satisfy. */
export interface IntegrityQueryable {
  query(sql: string): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

export interface IntegrityCheckResult {
  name: string;
  /** True when the check ran and found zero offending rows. */
  ok: boolean;
  rowCount: number;
  sampleRows: unknown[];
  /** Set instead of `rowCount`/`sampleRows` when the query itself failed
   *  (e.g. a column renamed out from under a check) — also treated as a
   *  failure, never silently skipped. */
  error?: string;
}

/** Audit C's seven pricing checks. */
export const PRICING_INTEGRITY_CHECKS: readonly IntegrityCheck[] = [
  {
    name: 'invalid_current_money',
    sql: `select sku_id,price from current_prices where price not between 1 and 10000000000000 limit 25`,
  },
  {
    name: 'invalid_history_money',
    sql: `select id,sku_id,price from price_points where price not between 1 and 10000000000000 limit 25`,
  },
  {
    name: 'current_without_history',
    sql: `select cp.sku_id from current_prices cp where not exists(select 1 from price_points pp where pp.sku_id=cp.sku_id) limit 25`,
  },
  {
    name: 'current_version_missing_from_history',
    sql: `select cp.sku_id,cp.version from current_prices cp where not exists(select 1 from price_points pp where pp.sku_id=cp.sku_id and pp.version=cp.version) limit 25`,
  },
  {
    name: 'current_history_mismatch',
    sql: `select cp.sku_id from current_prices cp join price_points pp on pp.sku_id=cp.sku_id and pp.version=cp.version where (cp.price,cp.unit,cp.price_basis,cp.price_is_estimated) is distinct from (pp.price,pp.unit,pp.price_basis,pp.price_is_estimated) limit 25`,
  },
  {
    name: 'future_confirmation',
    sql: `select sku_id,confirmed_at from current_prices where confirmed_at>now()+interval '1 minute' limit 25`,
  },
  {
    name: 'duplicate_source_event',
    sql: `select source_event_key,count(*) from price_points where source_event_key is not null group by source_event_key having count(*)>1 limit 25`,
  },
];

/** Audit E's twenty order/warehouse/settlement checks. Never selects customer
 *  data — every check returns ids only, so a failure report is safe to send
 *  to an error tracker. */
export const ORDER_WAREHOUSE_INTEGRITY_CHECKS: readonly IntegrityCheck[] = [
  {
    name: 'duplicate_orders_per_lead',
    sql: `select lead_id from orders where lead_id is not null group by lead_id having count(*)>1 limit 25`,
  },
  {
    name: 'order_lead_owner_mismatch',
    sql: `select o.id from orders o join leads l on l.id=o.lead_id where o.user_id is distinct from l.user_id limit 25`,
  },
  {
    name: 'invalid_stock',
    sql: `select id from warehouse_items where not(quantity_tons between 0 and 100000) or monthly_fee_toman not between 0 and 1000000000 limit 25`,
  },
  {
    name: 'stock_ledger_mismatch',
    sql: `select w.id from warehouse_items w left join warehouse_movements m on m.warehouse_item_id=w.id group by w.id having count(m.id)=0 or abs(w.quantity_tons-coalesce(sum(m.delta_tons),0))>0.0000001 limit 25`,
  },
  {
    name: 'released_positive_stock',
    sql: `select id from warehouse_items where status='released' and quantity_tons<>0 limit 25`,
  },
  {
    name: 'invalid_movement',
    sql: `select id from warehouse_movements where not(quantity_after_tons between 0 and 100000) or not(delta_tons between -100000 and 100000) or (kind='receipt' and delta_tons<=0) or (kind='release' and delta_tons>=0) limit 25`,
  },
  {
    name: 'settlement_owner_mismatch',
    sql: `select s.id from warehouse_settlements s join warehouse_items w on w.id=s.warehouse_item_id where s.user_id<>w.user_id limit 25`,
  },
  {
    name: 'invalid_settlement',
    sql: `select id from warehouse_settlements where period_to<=period_from or amount_toman not between -9007199254740991 and 9007199254740991 or (voids_settlement_id is null and amount_toman<0) limit 25`,
  },
  {
    name: 'overlapping_active_settlements',
    sql: `select a.id from warehouse_settlements a join warehouse_settlements b on a.warehouse_item_id=b.warehouse_item_id and a.id<b.id where a.voided_at is null and b.voided_at is null and a.voids_settlement_id is null and b.voids_settlement_id is null and a.period_from<b.period_to and b.period_from<a.period_to limit 25`,
  },
  {
    name: 'invalid_reversal',
    sql: `select r.id from warehouse_settlements r left join warehouse_settlements o on o.id=r.voids_settlement_id where r.voids_settlement_id is not null and (o.id is null or o.voided_at is null or o.voids_settlement_id is not null or r.amount_toman<>-o.amount_toman or r.user_id<>o.user_id or r.warehouse_item_id<>o.warehouse_item_id or r.period_from<>o.period_from or r.period_to<>o.period_to) limit 25`,
  },
  {
    name: 'missing_or_duplicate_reversal',
    sql: `select o.id from warehouse_settlements o left join warehouse_settlements r on r.voids_settlement_id=o.id where o.voided_at is not null and o.voids_settlement_id is null group by o.id having count(r.id)<>1 limit 25`,
  },
  {
    name: 'missing_order_snapshot',
    sql: `select o.id from orders o where o.terms is null or exists(select 1 from order_items i where i.order_id=o.id and (i.snapshot is null or (i.sku_id is not null and i.historical_sku_id is null))) limit 25`,
  },
  {
    name: 'reservation_owner_mismatch',
    sql: `select r.id from warehouse_reservations r join warehouse_items w on w.id=r.warehouse_item_id where r.owner_id<>w.user_id limit 25`,
  },
  {
    name: 'over_reserved_stock',
    sql: `select w.id from warehouse_items w join warehouse_reservations r on r.warehouse_item_id=w.id and r.status='reserved' group by w.id having sum(r.quantity_tons)>w.quantity_tons+0.0000001 limit 25`,
  },
  {
    name: 'over_fulfilled_order_line',
    sql: `select i.id from order_items i join order_fulfillments f on f.order_item_id=i.id group by i.id having sum(case when f.kind='delivery' then f.quantity else -f.quantity end)<-0.0000001 or sum(case when f.kind='delivery' then f.quantity else 0 end)>i.qty+0.0000001 limit 25`,
  },
  {
    name: 'consumed_reservation_without_delivery',
    sql: `select r.id from warehouse_reservations r where r.status='consumed' and r.order_item_id is not null and not exists(select 1 from order_fulfillments f where f.reservation_id=r.id and f.kind='delivery') limit 25`,
  },
  {
    name: 'cash_owner_mismatch',
    sql: `select c.id from warehouse_cash_entries c join warehouse_items w on w.id=c.warehouse_item_id where c.owner_id<>w.user_id limit 25`,
  },
  {
    name: 'invalid_cash_reversal',
    sql: `select r.id from warehouse_cash_entries r left join warehouse_cash_entries o on o.id=r.reverses_id where r.kind='reversal' and (o.id is null or o.kind='reversal' or r.amount_toman<>-o.amount_toman or r.owner_id<>o.owner_id or r.warehouse_item_id<>o.warehouse_item_id) limit 25`,
  },
  {
    name: 'overpaid_owner_balance',
    sql: `select warehouse_item_id from warehouse_cash_entries group by warehouse_item_id having sum(case when kind in ('sale','payout','reversal') then amount_toman else 0 end)<0 limit 25`,
  },
  {
    name: 'stuck_outbox',
    sql: `select id from operation_outbox where status in ('sending','uncertain') and coalesce(claimed_at,created_at)<now()-interval '30 minutes' limit 25`,
  },
];

/**
 * Runs every check against `db` (a real `pg.Pool` in production, or anything
 * exposing the same single-argument `query`) and returns one result per
 * check. Never throws: a single check's query error is captured as that
 * check's own failure so one broken query cannot hide the rest.
 */
export async function runIntegrityChecks(
  db: IntegrityQueryable,
  checks: readonly IntegrityCheck[],
): Promise<IntegrityCheckResult[]> {
  const results: IntegrityCheckResult[] = [];
  for (const check of checks) {
    try {
      const result = await db.query(check.sql);
      const rowCount = result.rowCount ?? result.rows.length;
      results.push({ name: check.name, ok: rowCount === 0, rowCount, sampleRows: result.rows });
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        rowCount: 0,
        sampleRows: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
