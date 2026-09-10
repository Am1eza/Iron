/** Read-only inventory/accounting anomaly scan. Never prints customer data. */
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('[order-warehouse-integrity] DATABASE_URL is not set.');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const checks = [
  ['duplicate_orders_per_lead', `select lead_id from orders where lead_id is not null group by lead_id having count(*)>1`],
  ['order_lead_owner_mismatch', `select o.id from orders o join leads l on l.id=o.lead_id where o.user_id is distinct from l.user_id`],
  ['invalid_stock', `select id from warehouse_items where not(quantity_tons between 0 and 100000) or monthly_fee_toman not between 0 and 1000000000`],
  ['stock_ledger_mismatch', `select w.id from warehouse_items w left join warehouse_movements m on m.warehouse_item_id=w.id group by w.id having count(m.id)=0 or abs(w.quantity_tons-coalesce(sum(m.delta_tons),0))>0.0000001`],
  ['released_positive_stock', `select id from warehouse_items where status='released' and quantity_tons<>0`],
  ['invalid_movement', `select id from warehouse_movements where not(quantity_after_tons between 0 and 100000) or not(delta_tons between -100000 and 100000) or (kind='receipt' and delta_tons<=0) or (kind='release' and delta_tons>=0)`],
  ['settlement_owner_mismatch', `select s.id from warehouse_settlements s join warehouse_items w on w.id=s.warehouse_item_id where s.user_id<>w.user_id`],
  ['invalid_settlement', `select id from warehouse_settlements where period_to<=period_from or amount_toman not between -9007199254740991 and 9007199254740991 or (voids_settlement_id is null and amount_toman<0)`],
  ['overlapping_active_settlements', `select a.id from warehouse_settlements a join warehouse_settlements b on a.warehouse_item_id=b.warehouse_item_id and a.id<b.id where a.voided_at is null and b.voided_at is null and a.voids_settlement_id is null and b.voids_settlement_id is null and a.period_from<b.period_to and b.period_from<a.period_to`],
  ['invalid_reversal', `select r.id from warehouse_settlements r left join warehouse_settlements o on o.id=r.voids_settlement_id where r.voids_settlement_id is not null and (o.id is null or o.voided_at is null or o.voids_settlement_id is not null or r.amount_toman<>-o.amount_toman or r.user_id<>o.user_id or r.warehouse_item_id<>o.warehouse_item_id or r.period_from<>o.period_from or r.period_to<>o.period_to)`],
  ['missing_or_duplicate_reversal', `select o.id from warehouse_settlements o left join warehouse_settlements r on r.voids_settlement_id=o.id where o.voided_at is not null and o.voids_settlement_id is null group by o.id having count(r.id)<>1`],
  ['missing_order_snapshot', `select o.id from orders o where o.terms is null or exists(select 1 from order_items i where i.order_id=o.id and (i.snapshot is null or (i.sku_id is not null and i.historical_sku_id is null)))`],
  ['reservation_owner_mismatch', `select r.id from warehouse_reservations r join warehouse_items w on w.id=r.warehouse_item_id where r.owner_id<>w.user_id`],
  ['over_reserved_stock', `select w.id from warehouse_items w join warehouse_reservations r on r.warehouse_item_id=w.id and r.status='reserved' group by w.id having sum(r.quantity_tons)>w.quantity_tons+0.0000001`],
  ['over_fulfilled_order_line', `select i.id from order_items i join order_fulfillments f on f.order_item_id=i.id group by i.id having sum(case when f.kind='delivery' then f.quantity else -f.quantity end)<-0.0000001 or sum(case when f.kind='delivery' then f.quantity else 0 end)>i.qty+0.0000001`],
  ['consumed_reservation_without_delivery', `select r.id from warehouse_reservations r where r.status='consumed' and r.order_item_id is not null and not exists(select 1 from order_fulfillments f where f.reservation_id=r.id and f.kind='delivery')`],
  ['cash_owner_mismatch', `select c.id from warehouse_cash_entries c join warehouse_items w on w.id=c.warehouse_item_id where c.owner_id<>w.user_id`],
  ['invalid_cash_reversal', `select r.id from warehouse_cash_entries r left join warehouse_cash_entries o on o.id=r.reverses_id where r.kind='reversal' and (o.id is null or o.kind='reversal' or r.amount_toman<>-o.amount_toman or r.owner_id<>o.owner_id or r.warehouse_item_id<>o.warehouse_item_id)`],
  ['overpaid_owner_balance', `select warehouse_item_id from warehouse_cash_entries group by warehouse_item_id having sum(case when kind in ('sale','payout','reversal') then amount_toman else 0 end)<0`],
  ['stuck_outbox', `select id from operation_outbox where status in ('sending','uncertain') and coalesce(claimed_at,created_at)<now()-interval '30 minutes'`],
] as const;
let failed = 0;
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
  for (const [name, query] of checks) {
    const result = await client.query(`select count(*)::text as count from (${query}) anomalies`);
    const count = result.rows[0].count;
    if (count !== '0') failed++;
    console.log(`[${count === '0' ? 'PASS' : 'FAIL'}] ${name}: ${count}`);
  }
  console.log(`SUMMARY: ${checks.length - failed}/${checks.length} integrity controls passed.`);
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
if (failed) process.exitCode = 1;
