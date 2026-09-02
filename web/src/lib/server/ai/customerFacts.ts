/**
 * What we already know about a signed-in customer, from their own order
 * history — so the advisor stops asking a returning buyer questions the site
 * has the answers to.
 *
 * WHY HISTORY AND NOT A PROFILE FIELD. There is no saved-address column on
 * `users`, and adding one is a product decision (and a migration) rather than
 * something to slip into an AI change. But this business already records the
 * thing that matters: every confirmed advisor conversation writes a lead, and
 * since US-05.8 that lead carries the delivery city the chat established, in
 * `LeadContext` — a jsonb field that already allows extra keys, so nothing
 * about the schema changes. A customer's LAST recorded delivery city is a
 * better default than a profile field would be anyway: it is where they
 * actually took delivery, not where they once filled in a form.
 *
 * PRIVACY. This is only ever read for the signed-in session's OWN user id,
 * and it emits product names and a city — never another customer's anything,
 * and never this customer's name, mobile or reference numbers. It is injected
 * into a model prompt, so it is deliberately the smallest useful shape.
 *
 * Never throws. A returning customer whose history is momentarily unreadable
 * simply gets the same conversation a new one gets.
 */
import { leadsForUser, leadItemsOfMany } from '@/lib/server/repos/leadsRepo';
import type { LeadContext } from '@/lib/server/db/schema/leads';

/** How many past requests to read. Enough to recognise a repeat order without
 *  turning the system prompt into an account statement. */
const HISTORY_LEADS = 5;
/** Distinct products named in the prompt line. */
const HISTORY_PRODUCTS = 3;

export interface CustomerHistory {
  /** Distinct product names from the most recent requests, newest first. */
  products: string[];
  /** Delivery city recorded on the most recent request that had one. */
  city?: string;
  /** Total requests read (not the customer's lifetime count). */
  requestCount: number;
}

export async function getCustomerHistory(
  user: { id: string; mobile: string } | null,
): Promise<CustomerHistory | null> {
  if (!user) return null;
  try {
    const { rows } = await leadsForUser(user.id, user.mobile, 1, HISTORY_LEADS);
    if (rows.length === 0) return null;
    const items = await leadItemsOfMany(rows.map((r) => r.id));
    const products: string[] = [];
    for (const lead of rows) {
      for (const item of items.get(lead.id) ?? []) {
        if (item.name && !products.includes(item.name)) products.push(item.name);
      }
    }
    // Newest lead wins the city: `leadsForUser` orders by createdAt desc, so
    // the first one carrying a city is the most recent place they took
    // delivery — which is what "where do you want it?" is really asking.
    const city = rows
      .map((r) => (r.context as LeadContext | null)?.deliveryCity)
      .find((c): c is string => typeof c === 'string' && c.trim().length > 0);
    return {
      products: products.slice(0, HISTORY_PRODUCTS),
      ...(city ? { city } : {}),
      requestCount: rows.length,
    };
  } catch {
    return null;
  }
}

/**
 * The history as one system line.
 *
 * Framed as an OPENING, not as a fact sheet: a returning buyer being told
 * «you previously ordered X» is only useful if the advisor then does something
 * with it, and the thing to do is offer the repeat rather than start from
 * scratch. The city is explicitly marked as a default to CONFIRM, not to
 * assume — people do buy for more than one site, and quietly pricing freight
 * to last month's address is exactly the sort of silent assumption that turns
 * into a wrong quote.
 */
export function customerHistoryFact(history: CustomerHistory | null): string | null {
  if (!history || (history.products.length === 0 && !history.city)) return null;
  const parts: string[] = [];
  if (history.products.length > 0) {
    parts.push(
      `این کاربر قبلاً از آهن‌تایم درخواست داده و آخرین اقلامش این‌ها بوده‌اند: ${history.products.join('، ')}. ` +
        'اگر سؤالش به همان‌ها مربوط است، خودت پیشنهاد بده همان را دوباره برایش آماده کنی؛ از صفر نپرس.',
    );
  }
  if (history.city) {
    parts.push(
      `آخرین شهر تحویل ثبت‌شده‌اش «${history.city}» بوده. همان را پیش‌فرض بگیر، ولی یک‌بار کوتاه تأیید بگیر ` +
        '(«همان ' +
        history.city +
        ' باشد؟») چون ممکن است این بار پروژهٔ دیگری باشد؛ بدون تأیید، کرایهٔ حمل را روی آن حساب نکن.',
    );
  }
  return parts.join(' ');
}
