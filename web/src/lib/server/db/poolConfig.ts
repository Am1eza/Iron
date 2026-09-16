import { Pool, type PoolConfig } from 'pg';

function positive(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${name}`);
  return n;
}

export function databasePoolConfig(connectionString: string, requestScoped = false): PoolConfig {
  const max = requestScoped ? 5 : positive('PG_POOL_MAX', 10, 50);
  const workers = positive('WEB_CONCURRENCY', 3, 32);
  // Reserve connections for operations and allow two app replicas during rollout.
  const budget = positive('PG_APP_CONNECTION_BUDGET', 80, 10000);
  const replicas = positive('PG_MAX_REPLICAS', 2, 100);
  if (!requestScoped && (workers + 1) * max * replicas > budget) {
    throw new Error('Database connection budget exceeded by workers + jobs + replicas');
  }
  return {
    connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: positive('PG_STATEMENT_TIMEOUT_MS', 10000, 300000),
    lock_timeout: positive('PG_LOCK_TIMEOUT_MS', 2000, 30000),
    idle_in_transaction_session_timeout: 15000,
    application_name: process.env.PG_APPLICATION_NAME ?? 'ahantime-web',
    keepAlive: true,
  };
}

export function createDatabasePool(connectionString: string, requestScoped = false): Pool {
  const pool = new Pool(databasePoolConfig(connectionString, requestScoped));
  // pg removes the failed idle client. Handle its event so a PG restart does
  // not become an uncaught EventEmitter error that kills the worker.
  pool.on('error', (error: Error & { code?: string }) => {
    console.error('[db] idle connection failed', { code: error.code ?? 'unknown' });
  });
  return pool;
}
