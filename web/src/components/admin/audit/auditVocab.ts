/**
 * Persian vocabulary for the activity log — turns machine action codes and
 * raw column names into sentences a manager can read without a developer.
 *
 * The log's whole purpose is answering "who broke this and when", so every
 * action gets: a verb phrase, a tone (is this destructive?), and an icon
 * bucket. Anything not listed still renders — falling back to the raw code
 * beats hiding an event nobody mapped yet.
 */

export type AuditTone = 'create' | 'update' | 'destroy' | 'publish' | 'access' | 'money';

export interface ActionMeta {
  /** Verb phrase completing «<کاربر> …» — e.g. «قیمت‌ها را ذخیره کرد». */
  verb: string;
  tone: AuditTone;
}

export const ACTION_META: Record<string, ActionMeta> = {
  'account.delete': { verb: 'حساب کاربری را حذف کرد', tone: 'destroy' },

  'ai.correction.create': { verb: 'اصلاحیهٔ هوش مصنوعی ثبت کرد', tone: 'create' },
  'ai.correction.update': { verb: 'اصلاحیهٔ هوش مصنوعی را ویرایش کرد', tone: 'update' },
  'ai.eval_candidate.create': { verb: 'نمونهٔ ارزیابی هوش مصنوعی ساخت', tone: 'create' },
  'ai.eval_candidate.status': { verb: 'وضعیت نمونهٔ ارزیابی را تغییر داد', tone: 'update' },

  'alert.status.update': { verb: 'وضعیت هشدار قیمت را تغییر داد', tone: 'update' },

  'catalog.category.create': { verb: 'دسته‌بندی جدید ساخت', tone: 'create' },
  'catalog.category.update': { verb: 'دسته‌بندی را ویرایش کرد', tone: 'update' },
  'catalog.category.deactivate': { verb: 'دسته‌بندی را غیرفعال کرد', tone: 'destroy' },
  'catalog.sub.create': { verb: 'زیردسته ساخت', tone: 'create' },
  'catalog.sub.update': { verb: 'زیردسته را ویرایش کرد', tone: 'update' },
  'catalog.sub.deactivate': { verb: 'زیردسته را غیرفعال کرد', tone: 'destroy' },
  'catalog.sku.create': { verb: 'کالای جدید ثبت کرد', tone: 'create' },
  'catalog.sku.update': { verb: 'کالا را ویرایش کرد', tone: 'update' },
  'catalog.sku.deactivate': { verb: 'کالا را غیرفعال کرد', tone: 'destroy' },

  'club.tier': { verb: 'سطح باشگاه مشتری را تغییر داد', tone: 'update' },

  'contact.reply': { verb: 'به پیام تماس پاسخ داد', tone: 'update' },
  'contact.status': { verb: 'وضعیت پیام تماس را تغییر داد', tone: 'update' },

  'content.create': { verb: 'مقالهٔ جدید ساخت', tone: 'create' },
  'content.update': { verb: 'مقاله را ویرایش کرد', tone: 'update' },
  'content.publish': { verb: 'مقاله را منتشر کرد', tone: 'publish' },
  // Taking live content off the public site is destructive, not an edit —
  // previously it was audited as a plain `content.update`, indistinguishable
  // from fixing a typo.
  'content.unpublish': { verb: 'انتشار مقاله را لغو کرد', tone: 'destroy' },
  'content.delete': { verb: 'مقاله را حذف کرد', tone: 'destroy' },

  'lead.update': { verb: 'سرنخ را به‌روزرسانی کرد', tone: 'update' },
  'lead.item_update': { verb: 'اقلام سرنخ را ویرایش کرد', tone: 'update' },
  'lead.note': { verb: 'یادداشت روی سرنخ گذاشت', tone: 'update' },
  'lead.proforma': { verb: 'پیش‌فاکتور صادر کرد', tone: 'money' },
  'lead.order': { verb: 'از سرنخ سفارش ثبت کرد', tone: 'money' },
  'lead.delete': { verb: 'سرنخ را حذف کرد', tone: 'destroy' },
  'lead.export': { verb: 'خروجی اکسل سرنخ‌ها را گرفت', tone: 'access' },

  'market.billet': { verb: 'قیمت شمش بازار را ثبت کرد', tone: 'money' },
  'media.upload': { verb: 'فایل بارگذاری کرد', tone: 'create' },

  'order.status': { verb: 'وضعیت سفارش را تغییر داد', tone: 'update' },
  'order.shipping': { verb: 'اطلاعات حمل سفارش را ثبت کرد', tone: 'update' },
  'order.cancel': { verb: 'سفارش را لغو کرد', tone: 'destroy' },
  'proforma.cancel': { verb: 'پیش‌فاکتور را باطل کرد', tone: 'destroy' },

  'redirect.create': { verb: 'ریدایرکت ساخت', tone: 'create' },
  'redirect.update': { verb: 'ریدایرکت را ویرایش کرد', tone: 'update' },
  'redirect.delete': { verb: 'ریدایرکت را حذف کرد', tone: 'destroy' },

  'request.status': { verb: 'وضعیت درخواست را تغییر داد', tone: 'update' },
  'settings.update': { verb: 'تنظیمات سایت را تغییر داد', tone: 'update' },

  'user.create': { verb: 'کاربر جدید ساخت', tone: 'create' },
  'user.update': { verb: 'کاربر را ویرایش کرد', tone: 'update' },
  'user.revoke_sessions': { verb: 'نشست‌های کاربر را باطل کرد', tone: 'access' },
  'admin_allowlist.add': { verb: 'دسترسی پنل صادر/تغییر داد', tone: 'access' },
  'admin_allowlist.remove': { verb: 'دسترسی پنل را لغو کرد', tone: 'access' },

  'warehouse.create': { verb: 'قلم انبار ثبت کرد', tone: 'create' },
  'warehouse.update': { verb: 'قلم انبار را ویرایش کرد', tone: 'update' },
  'warehouse.settle': { verb: 'تسویهٔ انبار انجام داد', tone: 'money' },
  'warehouse.settle_void': { verb: 'تسویهٔ انبار را باطل کرد', tone: 'destroy' },
  'warehouse.settle_paid': { verb: 'تسویهٔ انبار را پرداخت‌شده ثبت کرد', tone: 'money' },
  'warehouse.delete': { verb: 'قلم انبار را حذف کرد', tone: 'destroy' },

  // W23 review fix: the real action string `savePrice` writes is
  // `price.update` (see pricing.service.ts / db/schema/system.ts's action
  // enum) — `'pricing.save'` never matched a single real audit row, so
  // every price change fell through to the generic `{verb: action, tone:
  // 'update'}` fallback: the raw English string rendered inline in an
  // otherwise Persian sentence, AND tagged the generic grey `update` tone
  // instead of `money` (the tone every other financial action gets, used
  // by managers filtering the activity feed for money-moving events).
  'price.update': { verb: 'قیمت کالا را به‌روزرسانی کرد', tone: 'money' },
};

/** Entity type → Persian noun, for the «روی <چه چیزی>» chip. */
export const ENTITY_LABEL: Record<string, string> = {
  sku: 'کالا',
  category: 'دسته‌بندی',
  sub: 'زیردسته',
  // Rows written before W24 used the raw camelCase type, which fell through
  // to `?? entityType` and printed Latin «subCategory» inside a Persian
  // sentence. Keep the alias so the existing log reads correctly.
  subCategory: 'زیردسته',
  lead: 'سرنخ',
  order: 'سفارش',
  proforma: 'پیش‌فاکتور',
  article: 'مقاله',
  content: 'مقاله',
  setting: 'تنظیمات',
  settings: 'تنظیمات',
  user: 'کاربر',
  admin_allowlist: 'دسترسی پنل',
  warehouse: 'انبار',
  redirect: 'ریدایرکت',
  alert: 'هشدار قیمت',
  club: 'باشگاه',
  media: 'فایل',
  request: 'درخواست',
  contact: 'پیام تماس',
  market: 'بازار',
  ai: 'هوش مصنوعی',
};

/** Column/field name → Persian label, for the field-level diff. */
export const FIELD_LABEL: Record<string, string> = {
  name: 'نام',
  title: 'عنوان',
  slug: 'نشانی صفحه',
  price: 'قیمت',
  unitPrice: 'قیمت واحد',
  total: 'مبلغ کل',
  discountToman: 'تخفیف',
  status: 'وضعیت',
  role: 'نقش',
  isActive: 'فعال',
  active: 'فعال',
  tier: 'سطح باشگاه',
  assigneeId: 'مسئول',
  callbackAt: 'زمان تماس',
  bodyMd: 'متن',
  excerpt: 'چکیده',
  publishedAt: 'زمان انتشار',
  deliveryTime: 'زمان تحویل',
  vatIncluded: 'شامل مالیات',
  weightKg: 'وزن (kg)',
  qty: 'مقدار',
  mobile: 'موبایل',
  label: 'برچسب',
  lostReason: 'دلیل ناموفق',
  trackingNumber: 'کد رهگیری',
  carrierName: 'شرکت حمل',
  imageUrl: 'تصویر',
  order: 'ترتیب',
};

export function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { verb: action, tone: 'update' };
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

/**
 * Field-level diff of the before/after snapshots — ONLY keys that actually
 * changed. The old log dumped both JSON blobs side by side and left the
 * reader to spot the difference; on a settings row that's ~40 unchanged
 * lines hiding the one that matters.
 *
 * Keys present in only one side still count (added/removed). Values are
 * compared by JSON identity, which is right for the scalars and small
 * arrays these snapshots hold.
 */
export function diffFields(before: unknown, after: unknown): FieldChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) changes.push({ key, before: bv, after: av });
  }
  return changes;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
