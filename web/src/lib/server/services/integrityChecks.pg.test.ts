// @vitest-environment node
/**
 * The integrity checks are only worth anything if their SQL actually runs
 * against the CURRENT schema. A check that errors is reported as a failure —
 * correctly, fail-closed — but it is a failure about the query, not about
 * the data, and a migration that renames a column would turn a silent gate
 * into a daily false alarm that people learn to ignore.
 *
 * So this executes every one of the 27 checks against a real migrated
 * database and asserts each one PARSES AND RUNS. It deliberately does not
 * assert the data is clean — on an empty database everything trivially
 * passes, which is exactly the false comfort audit E called out about its
 * own script («PASS روی دیتابیس خالی، درستی queryها را نشان می‌دهد نه صحت
 * reconciliation زنجیرهٔ واقعی»). Proving the queries are well-formed is the
 * honest claim; the daily job against live data is what proves the rest.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { Db } from '@/lib/server/db/client';
import {
  ORDER_WAREHOUSE_INTEGRITY_CHECKS,
  PRICING_INTEGRITY_CHECKS,
  runIntegrityChecks,
  type IntegrityQueryable,
} from './integrityChecks';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = (await createTestDb()) as { db: Db; close: () => Promise<void> });
}, 120_000);
afterAll(async () => {
  await close();
});

/** Drizzle's `execute` behind the minimal `query` shape the checks expect. */
const queryable: IntegrityQueryable = {
  async query(text: string) {
    const result = await getDb().execute(sql.raw(text));
    const rows =
      (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
    return {
      rowCount: Array.isArray(rows) ? rows.length : 0,
      rows: Array.isArray(rows) ? rows : [],
    };
  },
};

describe('every integrity check runs against the real migrated schema', () => {
  it('the pricing gate (audit C): all 7 checks execute without a SQL error', async () => {
    const results = await runIntegrityChecks(queryable, PRICING_INTEGRITY_CHECKS);
    expect(results).toHaveLength(PRICING_INTEGRITY_CHECKS.length);
    const broken = results.filter((r) => r.error);
    expect(
      broken.map((r) => `${r.name}: ${r.error}`),
      'a check whose SQL no longer matches the schema would alarm daily about the query, not the data',
    ).toEqual([]);
  });

  it('the order/warehouse gate (audit E): all 20 checks execute without a SQL error', async () => {
    const results = await runIntegrityChecks(queryable, ORDER_WAREHOUSE_INTEGRITY_CHECKS);
    expect(results).toHaveLength(ORDER_WAREHOUSE_INTEGRITY_CHECKS.length);
    const broken = results.filter((r) => r.error);
    expect(broken.map((r) => `${r.name}: ${r.error}`)).toEqual([]);
  });

  it('a check pointed at a table that does not exist IS reported as an error', async () => {
    // Proves the two assertions above can actually fail — without this they
    // would pass just as happily against an `error` field nothing ever sets.
    const results = await runIntegrityChecks(queryable, [
      { name: 'deliberately_broken', sql: 'select 1 from a_table_that_does_not_exist' },
    ]);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toBeTruthy();
  });

  it('every check name is unique — a duplicate would hide one gate behind another in the report', () => {
    const names = [...PRICING_INTEGRITY_CHECKS, ...ORDER_WAREHOUSE_INTEGRITY_CHECKS].map(
      (c) => c.name,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('every check is bounded — an unbounded scan on production data is its own outage', () => {
    // These run daily against the live database, inside the app's own pool.
    for (const check of [...PRICING_INTEGRITY_CHECKS, ...ORDER_WAREHOUSE_INTEGRITY_CHECKS]) {
      expect(check.sql.toLowerCase(), check.name).toContain('limit');
    }
  });

  it('no check writes — every one is a plain SELECT', () => {
    for (const check of [...PRICING_INTEGRITY_CHECKS, ...ORDER_WAREHOUSE_INTEGRITY_CHECKS]) {
      expect(check.sql.trimStart().toLowerCase().startsWith('select'), check.name).toBe(true);
      expect(check.sql.toLowerCase(), check.name).not.toMatch(
        /\b(insert|update|delete|drop|alter|truncate)\b/,
      );
    }
  });
});
