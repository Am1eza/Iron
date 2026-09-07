import type { LEAD_STATUSES } from '@/lib/server/db/schema/leads';

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Which status a lead may move to, from the one it is in.
 *
 * Until now PATCH /api/admin/leads/{id} accepted any of the four statuses from
 * any other one, so the raw API let a lead go straight back to 'new' — the
 * status that means "nobody has called this person yet". Every funnel number
 * and every aging/SLA report reads 'new' that way, so a lead that had already
 * been contacted (or won) could be laundered back into the untouched queue and
 * quietly reset its own clock. The UI never offered it; nothing stopped a
 * script, a stale tab replaying an old body, or a mistyped curl.
 *
 * The table is deliberately permissive in the forward direction (a deal can
 * close from anywhere) and closed only where the transition would state
 * something untrue about the past.
 */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  // Never contacted yet: any outcome is reachable, including closing on the
  // first call without a separate «تماس‌گرفته» hop.
  new: ['contacted', 'won', 'lost'],
  // Contacted is a fact about the past — it cannot be un-happened.
  contacted: ['won', 'lost'],
  // Reopening a won deal is legitimate (mis-clicks happen, orders fall
  // through) but it moves money and club tier, so it costs a reason.
  won: ['contacted', 'lost'],
  // A dead lead coming back to life is ordinary follow-up work, and it
  // understates nothing — no extra ceremony.
  lost: ['contacted', 'won'],
};

/** Leaving one of these has to be explained. Only 'won': it is the status that
 *  feeds `recomputeTier` and every revenue figure, so an unexplained reversal
 *  is indistinguishable from a rep hiding a bad month. Reopening a 'lost' lead
 *  adds work rather than erasing a number, so it stays friction-free. */
const REASON_REQUIRED_FROM: readonly LeadStatus[] = ['won'];

export const LEAD_STATUS_REASON_MIN = 3;

export type LeadStatusChangeRejection = {
  error: 'status_transition_invalid' | 'status_reason_required';
  message: string;
  httpStatus: 400 | 409;
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'جدید',
  contacted: 'تماس‌گرفته',
  won: 'موفق',
  lost: 'ناموفق',
};

/**
 * `null` when the change is allowed, otherwise the refusal to return verbatim.
 *
 * A no-op (`from === to`) is always allowed: the admin UI fires the same
 * mutation on a double click, and turning that into a 409 would make a
 * harmless repeat look like a real conflict.
 */
export function checkLeadStatusChange(input: {
  from: LeadStatus;
  to: LeadStatus;
  reason?: string | null;
}): LeadStatusChangeRejection | null {
  const { from, to } = input;
  if (from === to) return null;
  if (!LEAD_STATUS_TRANSITIONS[from].includes(to)) {
    return {
      error: 'status_transition_invalid',
      message: `تغییر وضعیت از «${LEAD_STATUS_LABEL[from]}» به «${LEAD_STATUS_LABEL[to]}» مجاز نیست.`,
      httpStatus: 409,
    };
  }
  if (REASON_REQUIRED_FROM.includes(from) && (input.reason ?? '').trim().length < LEAD_STATUS_REASON_MIN) {
    return {
      error: 'status_reason_required',
      message: `برای خارج‌کردن سرنخ از وضعیت «${LEAD_STATUS_LABEL[from]}» باید دلیل آن را بنویسید.`,
      httpStatus: 400,
    };
  }
  return null;
}
