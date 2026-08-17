/**
 * The advisor's user-facing API copy — the strings the /api/ai/* routes put in
 * front of a visitor when something goes wrong.
 *
 * They live here rather than inline in the route handlers for two reasons.
 * Next.js's App Router rejects any export from a `route.ts` that isn't an HTTP
 * method or one of its own config exports, so an inline constant is
 * untestable; and these are the only places outside the model's own output
 * where the ADVISOR speaks to the visitor, so they have to hold the same
 * register the model is instructed to use (AI_SYSTEM_PROMPT rule 21: تو, not
 * شما). Keeping them in one file is what makes «one voice» checkable —
 * see register.test.ts.
 */

/**
 * ONE message for every "the AI cannot answer right now" case — relay down,
 * credit exhausted, key revoked, daily budget spent, feature switched off.
 * It never says which: the visitor cannot act on the difference, and it points
 * at what they CAN do instead. The funnel closes on a human call, so the
 * fallback is the human path, not an apology.
 */
export const AI_UNAVAILABLE_MESSAGE =
  'دستیار هوشمند موقتاً در دسترس نیست. قیمت‌های لحظه‌ای و ابزارها در دسترس‌اند و کارشناسان ما هم پاسخگویند؛ درخواست مشاوره ثبت کن تا تماس بگیریم.';

/** An unexpected failure inside the pipeline, as opposed to a known upstream
 *  refusal or a deadline — retrying really can help here. */
export const AI_ERROR_MESSAGE = 'دستیار هوشمند با خطا مواجه شد. دوباره تلاش کن.';

/** POST /api/ai/lead/confirm — the button on the advisor's own confirmation
 *  card, so these render INSIDE the chat thread (ProformaDraftCard's error
 *  line) and are read as the advisor talking. */
export const LEAD_CONFIRM_MESSAGES = {
  authRequired: 'برای ثبت درخواست، وارد حساب کاربری شو.',
  noMobile: 'شمارهٔ موبایل حسابت ثبت نشده؛ با پشتیبانی تماس بگیر.',
  draftExpired: 'این خلاصه منقضی شده؛ دوباره از مشاور پیش‌فاکتور بخواه.',
  forbidden: 'این درخواست متعلق به حساب دیگری است.',
} as const;
