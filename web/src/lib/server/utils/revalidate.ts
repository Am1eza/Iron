/**
 * `revalidatePath` requires an active Next.js request-rendering context (the
 * "static generation store"); it throws when a route handler is invoked
 * directly outside real Next.js request handling — which is exactly how this
 * app's route-handler tests exercise admin write routes (see
 * lib/server/adminApi.test.ts). Cache invalidation failing is never worth
 * failing the write itself (the price/article WAS saved) — swallow it.
 */
import { revalidatePath as nextRevalidatePath } from 'next/cache';

export function safeRevalidatePath(path: string, type?: 'layout' | 'page'): void {
  try {
    nextRevalidatePath(path, type);
  } catch {
    // No request-rendering context (tests, or a non-Next caller) — the ISR
    // page(s) simply fall back to their `revalidate` window instead.
  }
}
