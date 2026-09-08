import type { LeadRow } from '@/lib/server/repos/leadsRepo';
import { LEAD_SOURCES } from '@/lib/server/db/schema/leads';
import { can } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';

const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;

export interface LeadListFilters {
  status?: LeadRow['status'];
  assigneeId?: string;
  q?: string;
  source?: string;
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
    source: (LEAD_SOURCES as readonly string[]).includes(p.get('source') ?? '') ? (p.get('source') as string) : undefined,
    q: p.get('q') ?? undefined,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  };
}

/**
 * Who may export WHICH leads.
 *
 * The shared queue is readable by every rep on purpose — they pick unassigned
 * leads out of it. But reading a page of it and walking out with 5000
 * customers' names and mobile numbers in a single file are not the same act,
 * and until now the CSV endpoint asked for nothing beyond `leads:read`: any
 * sales rep could download the entire customer database in one click.
 *
 * `leads:manage` exports across assignees. Everyone else exports their own
 * book — which is the case the button was built for (see `leadsExportUrl`'s
 * note about «سرنخ‌های من»). An unfiltered click is FORCED into own-scope
 * rather than refused: that click is the normal way to use the button, and a
 * 403 there would read as a broken panel rather than a rule. Explicitly naming
 * someone ELSE's id is a different request and is refused outright.
 */
export function resolveLeadExportScope(input: {
  role: Role;
  actorId: string;
  requested: LeadListFilters;
}): { ok: true; filters: LeadListFilters; unrestricted: boolean } | { ok: false } {
  const unrestricted = can(input.role, 'leads:manage');
  if (unrestricted) return { ok: true, filters: input.requested, unrestricted };
  if (input.requested.assigneeId && input.requested.assigneeId !== input.actorId) return { ok: false };
  return { ok: true, filters: { ...input.requested, assigneeId: input.actorId }, unrestricted };
}
