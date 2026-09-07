import { NextResponse, type NextRequest } from 'next/server';
import { audit, requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';
import { csvResponse } from '@/lib/server/utils/csv';
import { parseLeadListFilters, resolveLeadExportScope } from '../filters';

const HEADERS = ['ref', 'contactName', 'contactMobile', 'source', 'status', 'assigneeId', 'createdAt'] as const;
/** Same order-of-magnitude cap as the audit export — an unbounded CSV on a
 *  table that only grows is its own DoS risk. */
const EXPORT_MAX_ROWS = 5000;

/** GET /api/admin/leads/export — same filters as GET /api/admin/leads
 *  (status/assignee/q/from/to), capped, returned as a CSV download. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  // See `resolveLeadExportScope`: `leads:read` alone used to be enough to
  // download every customer's name and mobile in one click.
  const scope = resolveLeadExportScope({
    role: auth.session.role,
    actorId: auth.session.id,
    requested: parseLeadListFilters(req.nextUrl.searchParams),
  });
  if (!scope.ok) {
    return NextResponse.json(
      {
        error: 'export_scope_forbidden',
        message: 'خروجی گرفتن از سرنخ‌های کارشناس دیگر فقط از عهدهٔ مدیر سیستم برمی‌آید.',
      },
      { status: 403 },
    );
  }
  const { filters, unrestricted } = scope;
  const { leads } = await adminListLeads({ ...filters, page: 1, perPage: EXPORT_MAX_ROWS });

  // Every other admin write is audited; this READ walks out of the building
  // with up to 5000 customers' names and mobile numbers and left no trace at
  // all — the one action where "who pulled the customer list, and which slice
  // of it" is the exact question an investigation starts from.
  await audit(
    auth.session.id,
    'lead.export',
    { type: 'lead', id: 'bulk' },
    null,
    // `filters` is the EFFECTIVE slice, not what was asked for, so the trail
    // can never claim a whole-table export that the scoping above narrowed.
    { rows: leads.length, capped: leads.length >= EXPORT_MAX_ROWS, filters, unrestricted },
  );

  const rows = leads.map((l) => [
    l.ref,
    l.contactName,
    l.contactMobile,
    l.source,
    l.status,
    l.assigneeId,
    l.createdAt.toISOString(),
  ]);
  return csvResponse('ahantime-leads.csv', HEADERS, rows);
}

export const GET = withApiErrorHandling(GETImpl);
