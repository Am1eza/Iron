import { toPersianDigits } from './format';

export interface LeadUrgency {
  label: string;
  tone: 'loss' | 'warning';
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const faInt = (n: number) => toPersianDigits(String(Math.max(0, Math.round(n))));

/**
 * Presentation-only urgency badge for a leads-list row — mirrors the
 * SERVER's URGENCY_TIER (leadsRepo.ts) so what a rep sees on the row agrees
 * with the order the list is actually sorted in. Built only from fields
 * already on `AdminLead` (status/createdAt/updatedAt/callbackAt), so it
 * costs no extra request.
 *
 * Deliberately returns null for anything not genuinely worth flagging (a
 * brand-new lead a minute old, a callback still ahead of its time) — a badge
 * on every row is not a badge; it's wallpaper the rep learns to ignore.
 */
export function urgencyOf(
  lead: { status: 'new' | 'contacted' | 'won' | 'lost'; createdAt: string; updatedAt: string; callbackAt: string | null },
  now: Date,
): LeadUrgency | null {
  if (lead.status === 'new') {
    const hours = (now.getTime() - new Date(lead.createdAt).getTime()) / HOUR;
    if (hours < 0.5) return null; // still fresh — the rep hasn't had a fair chance yet
    if (hours >= 24) return { label: `${faInt(hours / 24)} روز بدون تماس`, tone: 'loss' };
    if (hours >= 2) return { label: `${faInt(hours)} ساعت بدون تماس`, tone: 'loss' };
    return { label: 'کمتر از ۲ ساعت پیش', tone: 'warning' };
  }

  if (lead.status === 'contacted') {
    // An overdue callback is a broken promise — always the loudest signal
    // this function can raise, regardless of how long ago it was set.
    if (lead.callbackAt) {
      const overdueMs = now.getTime() - new Date(lead.callbackAt).getTime();
      if (overdueMs <= 0) return null; // has a plan, not due yet — already shown as «تماس: …»
      const hours = overdueMs / HOUR;
      return {
        label: hours >= 24 ? `پیگیری ${faInt(hours / 24)} روز عقب‌افتاده` : `پیگیری ${faInt(hours)} ساعت عقب‌افتاده`,
        tone: 'loss',
      };
    }
    // No plan at all — flag it once it's been sitting a while; `updatedAt` is
    // the closest proxy this list has for "last touched" without a second query.
    const days = (now.getTime() - new Date(lead.updatedAt).getTime()) / DAY;
    if (days >= 3) return { label: `${faInt(days)} روز بدون پیگیری`, tone: 'loss' };
    if (days >= 1) return { label: `${faInt(days)} روز پیش`, tone: 'warning' };
    return null;
  }

  return null; // won/lost — closed, nothing left to flag
}
