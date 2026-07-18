import type { AuditFilterQuery } from '@/lib/server/repos/auditRepo';

/** Shared query-string → filter parsing for both GET /api/admin/audit (paged
 *  view) and GET /api/admin/audit/export (CSV) — identical filter set, per
 *  US-23.2. NOT named route.ts: Next's App Router only recognizes a
 *  restricted export surface (GET/POST/...) from an actual `route.ts`, so
 *  this shared helper lives in its own plain module instead of being
 *  imported cross-route from one. Invalid from/to dates are silently ignored
 *  rather than 400'd — a stray malformed value shouldn't break the whole
 *  list, it just won't filter by date. */
export function parseAuditFilters(p: URLSearchParams): AuditFilterQuery {
  const from = p.get('from');
  const to = p.get('to');
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  return {
    entityType: p.get('entityType') ?? undefined,
    entityId: p.get('entityId') ?? undefined,
    actorId: p.get('actor') ?? undefined,
    action: p.get('action') ?? undefined,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  };
}
