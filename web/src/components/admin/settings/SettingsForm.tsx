'use client';
/** Business-rule settings — grouped cards, one validated key per save. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { normalizeDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, Heading, Text, TableSkeleton, EmptyState } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

interface Logistics {
  originLabel: string;
  freightRatePerTonKm: number;
  freightMinTrip: number;
  handlingPerTon: number;
  insuranceRate: number;
  scaleFee: number;
  cities: { name: string; km: number }[];
}

export function SettingsForm() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => adminApi.saveSetting(key, value),
    onSuccess: () => {
      toast.success('تنظیمات ذخیره شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیرهٔ تنظیمات ناموفق بود.'),
  });

  const get = <T,>(key: string, fallback: T): T => {
    const hit = data?.settings.find((s) => s.key === key);
    return hit ? (hit.value as T) : fallback;
  };

  if (isLoading) return <TableSkeleton rows={4} cols={2} />;

  // Critical: without this, a failed fetch left `data` undefined and every
  // card silently rendered its hardcoded fallback (VAT=10%, default freight
  // rates, …) as if they were the live settings — an admin could believe a
  // stale/wrong value is correct, or worse, "save" a card and overwrite the
  // real settings with these fabricated defaults.
  if (isError) {
    return (
      <EmptyState
        tone="error"
        headline="بارگذاری تنظیمات ناموفق بود."
        body="این‌ها مقادیر واقعی نیستند — تا رفع خطا چیزی را ذخیره نکنید."
        primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <PricingRulesCard
        vat={get('VAT_RATE', 0.1)}
        hideDays={get('PRICE_STALE_HIDE_AFTER_DAYS', 2)}
        quoteHour={get('QUOTE_VALIDITY_HOUR', 11)}
        alertCap={get('ALERT_MAX_ACTIVE_PER_USER', 20)}
        onSave={(key, value) => save.mutate({ key, value })}
        busy={save.isPending}
      />
      <SmsAutomationsCard
        cfg={get('SMS_AUTOMATIONS', { welcome: true, proformaReminder: true, callbackReminder: true })}
        onSave={(v) => save.mutate({ key: 'SMS_AUTOMATIONS', value: v })}
        busy={save.isPending}
      />
      <ContactSettingsCard
        contact={get('SITE_CONTACT', {
          address: 'تهران، اقدسیه، خیابان موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، طبقه چهارم، واحد ۷',
          phoneLandline: '02126297512',
          phoneMobile: '09121395954',
          email: '',
        })}
        onSave={(v) => save.mutate({ key: 'SITE_CONTACT', value: v })}
        busy={save.isPending}
      />
      <HolidaysCard holidays={get<string[]>('HOLIDAYS', [])} onSave={(v) => save.mutate({ key: 'HOLIDAYS', value: v })} busy={save.isPending} />
      <LogisticsCard
        cfg={get<Logistics>('LOGISTICS', {
          originLabel: 'انبار شادآباد تهران',
          freightRatePerTonKm: 1100,
          freightMinTrip: 2500000,
          handlingPerTon: 150000,
          insuranceRate: 0.0025,
          scaleFee: 75000,
          cities: [],
        })}
        onSave={(v) => save.mutate({ key: 'LOGISTICS', value: v })}
        busy={save.isPending}
      />
    </div>
  );
}

function num(v: string): number {
  return Number(normalizeDigits(v));
}

function PricingRulesCard({
  vat,
  hideDays,
  quoteHour,
  alertCap,
  onSave,
  busy,
}: {
  vat: number;
  hideDays: number;
  quoteHour: number;
  alertCap: number;
  onSave: (key: string, value: unknown) => void;
  busy: boolean;
}) {
  const [v, setV] = useState({ vat: String(vat * 100), hideDays: String(hideDays), quoteHour: String(quoteHour), alertCap: String(alertCap) });
  const [errors, setErrors] = useState<{ vat?: string; hideDays?: string; quoteHour?: string; alertCap?: string }>({});
  useEffect(() => {
    setV({ vat: String(vat * 100), hideDays: String(hideDays), quoteHour: String(quoteHour), alertCap: String(alertCap) });
    setErrors({});
  }, [vat, hideDays, quoteHour, alertCap]);

  const NON_NEGATIVE_MSG = 'عدد صحیح و نامنفی وارد کنید.';

  const saveVat = () => {
    const n = num(v.vat);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErrors((e) => ({ ...e, vat: 'عددی بین ۰ تا ۱۰۰ وارد کنید.' }));
      return;
    }
    setErrors((e) => ({ ...e, vat: undefined }));
    onSave('VAT_RATE', n / 100);
  };
  const saveHideDays = () => {
    const n = num(v.hideDays);
    if (!Number.isFinite(n) || n < 0) {
      setErrors((e) => ({ ...e, hideDays: NON_NEGATIVE_MSG }));
      return;
    }
    setErrors((e) => ({ ...e, hideDays: undefined }));
    onSave('PRICE_STALE_HIDE_AFTER_DAYS', Math.round(n));
  };
  const saveQuoteHour = () => {
    const n = num(v.quoteHour);
    if (!Number.isFinite(n) || n < 0) {
      setErrors((e) => ({ ...e, quoteHour: NON_NEGATIVE_MSG }));
      return;
    }
    setErrors((e) => ({ ...e, quoteHour: undefined }));
    onSave('QUOTE_VALIDITY_HOUR', Math.round(n));
  };
  const saveAlertCap = () => {
    const n = num(v.alertCap);
    if (!Number.isFinite(n) || n < 0) {
      setErrors((e) => ({ ...e, alertCap: NON_NEGATIVE_MSG }));
      return;
    }
    setErrors((e) => ({ ...e, alertCap: undefined }));
    onSave('ALERT_MAX_ACTIVE_PER_USER', Math.round(n));
  };

  return (
    <Card>
      <Heading level={2}>قوانین قیمت و هشدار</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="ارزش افزوده (٪)" inputMode="decimal" value={v.vat} error={errors.vat} onChange={(e) => setV({ ...v, vat: e.target.value })} />
        <TextInput label="پنهان‌سازی قیمت پس از (روز کاری)" inputMode="numeric" value={v.hideDays} error={errors.hideDays} onChange={(e) => setV({ ...v, hideDays: e.target.value })} />
        <TextInput label="ساعت اعتبار پیش‌فاکتور (روز کاری بعد)" inputMode="numeric" value={v.quoteHour} error={errors.quoteHour} onChange={(e) => setV({ ...v, quoteHour: e.target.value })} />
        <TextInput label="سقف هشدار فعال هر کاربر" inputMode="numeric" value={v.alertCap} error={errors.alertCap} onChange={(e) => setV({ ...v, alertCap: e.target.value })} />
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" loading={busy} onClick={saveVat}>
          ذخیرهٔ ارزش افزوده
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={saveHideDays}>
          ذخیرهٔ پنهان‌سازی
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={saveQuoteHour}>
          ذخیرهٔ ساعت اعتبار
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={saveAlertCap}>
          ذخیرهٔ سقف هشدار
        </Button>
      </div>
    </Card>
  );
}

type HolidayRow = { id: string; date: string };
const newRowId = () => (typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));

/** US-22.2 — structured addable/removable rows instead of a free-text
 *  textarea (one typo used to silently drop or corrupt every date after it). */
function HolidaysCard({ holidays, onSave, busy }: { holidays: string[]; onSave: (v: string[]) => void; busy: boolean }) {
  const [rows, setRows] = useState<HolidayRow[]>(() => holidays.map((date) => ({ id: newRowId(), date })));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setRows(holidays.map((date) => ({ id: newRowId(), date })));
    setRowErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holidays]);

  const setDate = (id: string, date: string) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, date } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, { id: newRowId(), date: '' }]);

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const dates: string[] = [];
    for (const r of rows) {
      const d = normalizeDigits(r.date).trim();
      if (!d) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        nextErrors[r.id] = 'فرمت باید 1405-01-13 باشد.';
        continue;
      }
      dates.push(d);
    }
    setRowErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSave(dates);
  };

  return (
    <Card>
      <Heading level={2}>تعطیلات رسمی</Heading>
      <Text color="muted">تاریخ جلالی به شکل 1405-01-13؛ جمعه‌ها خودکار تعطیل‌اند.</Text>
      <div style={{ display: 'grid', gap: 'var(--space-2)', marginBlockStart: 'var(--space-3)' }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            <TextInput
              label="تاریخ"
              dir="ltr"
              inputMode="numeric"
              placeholder="1405-01-13"
              value={r.date}
              error={rowErrors[r.id]}
              onChange={(e) => setDate(r.id, e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
            <Button size="sm" variant="ghost" onClick={() => removeRow(r.id)} style={{ marginBlockStart: 'var(--space-5)' }}>
              حذف
            </Button>
          </div>
        ))}
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" variant="secondary" onClick={addRow}>
          افزودن تاریخ
        </Button>
        <Button size="sm" loading={busy} onClick={submit}>
          ذخیرهٔ تعطیلات
        </Button>
      </div>
    </Card>
  );
}

type CityRow = { id: string; name: string; km: string };

function LogisticsCard({ cfg, onSave, busy }: { cfg: Logistics; onSave: (v: Logistics) => void; busy: boolean }) {
  const [v, setV] = useState({
    originLabel: cfg.originLabel,
    rate: String(cfg.freightRatePerTonKm),
    minTrip: String(cfg.freightMinTrip),
    handling: String(cfg.handlingPerTon),
    insurance: String(cfg.insuranceRate * 100),
    scale: String(cfg.scaleFee),
  });
  const [cities, setCities] = useState<CityRow[]>(() => cfg.cities.map((c) => ({ id: newRowId(), name: c.name, km: String(c.km) })));
  const [cityErrors, setCityErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setV({
      originLabel: cfg.originLabel,
      rate: String(cfg.freightRatePerTonKm),
      minTrip: String(cfg.freightMinTrip),
      handling: String(cfg.handlingPerTon),
      insurance: String(cfg.insuranceRate * 100),
      scale: String(cfg.scaleFee),
    });
    setCities(cfg.cities.map((c) => ({ id: newRowId(), name: c.name, km: String(c.km) })));
    setCityErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const [errors, setErrors] = useState<{
    rate?: string;
    minTrip?: string;
    handling?: string;
    insurance?: string;
    scale?: string;
  }>({});

  const NON_NEGATIVE_MSG = 'عدد معتبر و نامنفی وارد کنید.';

  const setCityField = (id: string, patch: Partial<CityRow>) =>
    setCities((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCity = (id: string) => setCities((prev) => prev.filter((c) => c.id !== id));
  const addCity = () => setCities((prev) => [...prev, { id: newRowId(), name: '', km: '' }]);

  const submit = () => {
    const nextErrors: typeof errors = {};

    const rate = num(v.rate);
    if (!Number.isFinite(rate) || rate < 0) nextErrors.rate = NON_NEGATIVE_MSG;
    const minTrip = num(v.minTrip);
    if (!Number.isFinite(minTrip) || minTrip < 0) nextErrors.minTrip = NON_NEGATIVE_MSG;
    const handling = num(v.handling);
    if (!Number.isFinite(handling) || handling < 0) nextErrors.handling = NON_NEGATIVE_MSG;
    const insurance = num(v.insurance);
    if (!Number.isFinite(insurance) || insurance < 0) nextErrors.insurance = NON_NEGATIVE_MSG;
    const scale = num(v.scale);
    if (!Number.isFinite(scale) || scale < 0) nextErrors.scale = NON_NEGATIVE_MSG;

    const nextCityErrors: Record<string, string> = {};
    const cityValues: { name: string; km: number }[] = [];
    for (const c of cities) {
      const name = c.name.trim();
      const km = num(c.km);
      if (!name && !c.km.trim()) continue; // fully empty row — skip silently
      if (!name || !Number.isFinite(km) || km <= 0) {
        nextCityErrors[c.id] = 'نام شهر و فاصله (کیلومتر، عدد مثبت) را کامل وارد کنید.';
        continue;
      }
      cityValues.push({ name, km });
    }

    setErrors(nextErrors);
    setCityErrors(nextCityErrors);
    if (Object.values(nextErrors).some(Boolean) || Object.keys(nextCityErrors).length > 0) return;

    onSave({
      originLabel: v.originLabel.trim(),
      freightRatePerTonKm: rate,
      freightMinTrip: minTrip,
      handlingPerTon: handling,
      insuranceRate: insurance / 100,
      scaleFee: scale,
      cities: cityValues,
    });
  };

  return (
    <Card>
      <Heading level={2}>لجستیک و هزینهٔ حمل</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="مبدأ بارگیری" value={v.originLabel} onChange={(e) => setV({ ...v, originLabel: e.target.value })} />
        <TextInput label="نرخ حمل (تومان/تن‌کیلومتر)" inputMode="numeric" value={v.rate} error={errors.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
        <TextInput label="حداقل کرایهٔ سرویس (تومان)" inputMode="numeric" value={v.minTrip} error={errors.minTrip} onChange={(e) => setV({ ...v, minTrip: e.target.value })} />
        <TextInput label="بارگیری/تخلیه (تومان/تن)" inputMode="numeric" value={v.handling} error={errors.handling} onChange={(e) => setV({ ...v, handling: e.target.value })} />
        <TextInput label="بیمه (٪ ارزش کالا)" inputMode="decimal" value={v.insurance} error={errors.insurance} onChange={(e) => setV({ ...v, insurance: e.target.value })} />
        <TextInput label="باسکول (تومان)" inputMode="numeric" value={v.scale} error={errors.scale} onChange={(e) => setV({ ...v, scale: e.target.value })} />
      </div>

      <div style={{ marginBlockStart: 'var(--space-3)' }}>
        <Text color="muted">شهرهای مقصد و فاصله از مبدأ</Text>
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', marginBlockStart: 'var(--space-2)' }}>
        {cities.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
            <TextInput label="نام شهر" value={c.name} onChange={(e) => setCityField(c.id, { name: e.target.value })} />
            <TextInput
              label="فاصله (کیلومتر)"
              inputMode="numeric"
              value={c.km}
              error={cityErrors[c.id]}
              onChange={(e) => setCityField(c.id, { km: e.target.value })}
            />
            <Button size="sm" variant="ghost" onClick={() => removeCity(c.id)} style={{ marginBlockStart: 'var(--space-5)' }}>
              حذف
            </Button>
          </div>
        ))}
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" variant="secondary" onClick={addCity}>
          افزودن شهر
        </Button>
        <Button size="sm" loading={busy} onClick={submit}>
          ذخیرهٔ لجستیک
        </Button>
      </div>
    </Card>
  );
}

interface SiteContactValue {
  address: string;
  phoneLandline: string;
  phoneMobile: string;
  email?: string;
}

/** اطلاعات تماس سایت — the numbers/address printed in the footer, contact
 *  page, proforma letterhead and JSON-LD. Editable without a deploy. */
function ContactSettingsCard({
  contact,
  onSave,
  busy,
}: {
  contact: SiteContactValue;
  onSave: (v: SiteContactValue) => void;
  busy: boolean;
}) {
  const [v, setV] = useState(contact);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setV(contact);
    setError(undefined);
  }, [contact]);

  const submit = () => {
    const landline = normalizeDigits(v.phoneLandline).replace(/\D/g, '');
    const mobile = normalizeDigits(v.phoneMobile).replace(/\D/g, '');
    if (!v.address.trim()) return setError('آدرس را وارد کنید.');
    if (!/^0\d{9,10}$/.test(landline)) return setError('شمارهٔ ثابت معتبر نیست (مثلاً 02126297512).');
    if (!/^09\d{9}$/.test(mobile)) return setError('شمارهٔ همراه معتبر نیست (۰۹xxxxxxxxx).');
    setError(undefined);
    onSave({ address: v.address.trim(), phoneLandline: landline, phoneMobile: mobile, email: v.email?.trim() || '' });
  };

  return (
    <Card>
      <Heading level={2}>اطلاعات تماس سایت</Heading>
      <Text color="muted">در فوتر، صفحهٔ تماس، سربرگ پیش‌فاکتور و داده‌های سئو استفاده می‌شود.</Text>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="شمارهٔ ثابت" inputMode="tel" dir="ltr" value={v.phoneLandline} onChange={(e) => setV({ ...v, phoneLandline: e.target.value })} />
        <TextInput label="شمارهٔ همراه" inputMode="tel" dir="ltr" value={v.phoneMobile} onChange={(e) => setV({ ...v, phoneMobile: e.target.value })} />
        <TextInput label="ایمیل (اختیاری)" type="email" dir="ltr" value={v.email ?? ''} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <TextInput label="آدرس" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      </div>
      {error ? <p style={{ font: 'var(--t-caption)', color: 'var(--color-loss-text)', margin: 'var(--space-2) 0 0' }}>{error}</p> : null}
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" loading={busy} onClick={submit}>
          ذخیرهٔ اطلاعات تماس
        </Button>
      </div>
    </Card>
  );
}

interface SmsAutomationsValue {
  welcome: boolean;
  proformaReminder: boolean;
  callbackReminder: boolean;
}

/** پیامک‌های خودکار — روشن/خاموش‌کردن هر اتوماسیون بدون دیپلوی. */
function SmsAutomationsCard({
  cfg,
  onSave,
  busy,
}: {
  cfg: SmsAutomationsValue;
  onSave: (v: SmsAutomationsValue) => void;
  busy: boolean;
}) {
  const [v, setV] = useState(cfg);
  useEffect(() => setV(cfg), [cfg]);
  const Row = ({ k, label, hint }: { k: keyof SmsAutomationsValue; label: string; hint: string }) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer' }}>
      <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} style={{ marginBlockStart: 6 }} />
      <span>
        <span style={{ display: 'block', font: 'var(--t-label)', color: 'var(--color-text-strong)' }}>{label}</span>
        <span className={ui.muted}>{hint}</span>
      </span>
    </label>
  );
  return (
    <Card>
      <Heading level={2}>پیامک‌های خودکار</Heading>
      <div style={{ display: 'grid', gap: 'var(--space-3)', marginBlockStart: 'var(--space-3)' }}>
        <Row k="welcome" label="خوش‌آمدگویی" hint="با اولین ثبت‌نام هر کاربر ارسال می‌شود." />
        <Row k="proformaReminder" label="یادآوری اعتبار پیش‌فاکتور" hint="۲۴ ساعت قبل از پایان اعتبار، به مشتری (یک‌بار برای هر پیش‌فاکتور)." />
        <Row k="callbackReminder" label="یادآوری تماس به کارشناس" hint="در زمان تماس ثبت‌شده روی سرنخ، به موبایل کارشناس مسئول." />
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" loading={busy} onClick={() => onSave(v)}>
          ذخیرهٔ پیامک‌های خودکار
        </Button>
      </div>
    </Card>
  );
}
