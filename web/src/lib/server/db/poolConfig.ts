import { Pool, type PoolConfig } from 'pg';
import { reportError } from '@/lib/errors/report';

function positive(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${name}`);
  return n;
}

export function databasePoolConfig(connectionString: string, requestScoped = false): PoolConfig {
  const max = requestScoped ? 5 : positive('PG_POOL_MAX', 10, 50);
  const workers = positive('WEB_CONCURRENCY', 3, 32);
  // Reserve connections for operations. Default replicas=1 matches this
  // repo's actual deploy: docker-compose.yml's `web` is a single service
  // recreated in place (stop-then-start, see deploy.yml's own "NOT
  // zero-downtime" note), never two full replicas serving at once — see
  // .env.example's WEB_CONCURRENCY/PG_POOL_MAX budget comment, which already
  // sizes this host's real WEB_CONCURRENCY=5 against max_connections=100
  // with no such multiplier. A genuine blue/green or multi-host setup should
  // set PG_MAX_REPLICAS explicitly rather than rely on this default.
  const budget = positive('PG_APP_CONNECTION_BUDGET', 80, 10000);
  const replicas = positive('PG_MAX_REPLICAS', 1, 100);
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
    reportError(error, { where: 'db.pool.idle' });
  });
  return pool;
}
