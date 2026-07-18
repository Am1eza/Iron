import type { LeadRow } from '@/lib/server/repos/leadsRepo';

const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;

export interface LeadListFilters {
  status?: LeadRow['status'];
  assigneeId?: string;
  q?: string;
  from?: Date;
  to?: Date;
}

/** Shared query-string → filter parsing for GET /api/admin/leads and
 *  GET /api/admin/leads/export (US-19.3) — same reasoning as the audit
 *  routes' filters.ts: kept out of route.ts because Next's App Router only
 *  recognizes a restricted export surface (GET/POST/...) from an actual
 *  `route.ts`. Invalid from/to dates are silently ignored, not 400'd. */
export function parseLeadListFilters(p: URLSearchParams): LeadListFilters {
  const status = p.get('status');
  const from = p.get('from');
  const to = p.get('to');
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  return {
    status: status && (LEAD_STATUSES as readonly string[]).includes(status) ? (status as LeadRow['status']) : undefined,
    assigneeId: p.get('assignee') ?? undefined,
    q: p.get('q') ?? undefined,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  };
}
