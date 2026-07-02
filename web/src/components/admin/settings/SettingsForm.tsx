'use client';
/** Business-rule settings — grouped cards, one validated key per save. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { normalizeDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, Heading, Text, TableSkeleton } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
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
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });

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
  useEffect(() => {
    setV({ vat: String(vat * 100), hideDays: String(hideDays), quoteHour: String(quoteHour), alertCap: String(alertCap) });
  }, [vat, hideDays, quoteHour, alertCap]);

  return (
    <Card>
      <Heading level={3}>قوانین قیمت و هشدار</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="ارزش افزوده (٪)" inputMode="decimal" value={v.vat} onChange={(e) => setV({ ...v, vat: e.target.value })} />
        <TextInput label="پنهان‌سازی قیمت پس از (روز کاری)" inputMode="numeric" value={v.hideDays} onChange={(e) => setV({ ...v, hideDays: e.target.value })} />
        <TextInput label="ساعت اعتبار پیش‌فاکتور (روز کاری بعد)" inputMode="numeric" value={v.quoteHour} onChange={(e) => setV({ ...v, quoteHour: e.target.value })} />
        <TextInput label="سقف هشدار فعال هر کاربر" inputMode="numeric" value={v.alertCap} onChange={(e) => setV({ ...v, alertCap: e.target.value })} />
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" loading={busy} onClick={() => onSave('VAT_RATE', num(v.vat) / 100)}>
          ذخیرهٔ ارزش افزوده
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onSave('PRICE_STALE_HIDE_AFTER_DAYS', Math.round(num(v.hideDays)))}>
          ذخیرهٔ پنهان‌سازی
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onSave('QUOTE_VALIDITY_HOUR', Math.round(num(v.quoteHour)))}>
          ذخیرهٔ ساعت اعتبار
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onSave('ALERT_MAX_ACTIVE_PER_USER', Math.round(num(v.alertCap)))}>
          ذخیرهٔ سقف هشدار
        </Button>
      </div>
    </Card>
  );
}

function HolidaysCard({ holidays, onSave, busy }: { holidays: string[]; onSave: (v: string[]) => void; busy: boolean }) {
  const [text, setText] = useState(holidays.join('\n'));
  useEffect(() => setText(holidays.join('\n')), [holidays]);
  return (
    <Card>
      <Heading level={3}>تعطیلات رسمی</Heading>
      <Text color="muted">هر خط یک تاریخ جلالی به شکل 1405-01-13؛ جمعه‌ها خودکار تعطیل‌اند.</Text>
      <Textarea
        label="تاریخ‌ها"
        rows={5}
        dir="ltr"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontFamily: 'monospace' }}
      />
      <Button
        size="sm"
        style={{ marginBlockStart: 'var(--space-2)' }}
        loading={busy}
        onClick={() =>
          onSave(
            normalizeDigits(text)
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)),
          )
        }
      >
        ذخیرهٔ تعطیلات
      </Button>
    </Card>
  );
}

function LogisticsCard({ cfg, onSave, busy }: { cfg: Logistics; onSave: (v: Logistics) => void; busy: boolean }) {
  const [v, setV] = useState({
    originLabel: cfg.originLabel,
    rate: String(cfg.freightRatePerTonKm),
    minTrip: String(cfg.freightMinTrip),
    handling: String(cfg.handlingPerTon),
    insurance: String(cfg.insuranceRate * 100),
    scale: String(cfg.scaleFee),
    cities: cfg.cities.map((c) => `${c.name},${c.km}`).join('\n'),
  });
  useEffect(() => {
    setV({
      originLabel: cfg.originLabel,
      rate: String(cfg.freightRatePerTonKm),
      minTrip: String(cfg.freightMinTrip),
      handling: String(cfg.handlingPerTon),
      insurance: String(cfg.insuranceRate * 100),
      scale: String(cfg.scaleFee),
      cities: cfg.cities.map((c) => `${c.name},${c.km}`).join('\n'),
    });
  }, [cfg]);

  const submit = () => {
    const cities = normalizeDigits(v.cities)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, km] = l.split(/[,،]/).map((p) => p.trim());
        return { name: name ?? '', km: Number(km) || 0 };
      })
      .filter((c) => c.name && c.km > 0);
    onSave({
      originLabel: v.originLabel.trim(),
      freightRatePerTonKm: num(v.rate),
      freightMinTrip: num(v.minTrip),
      handlingPerTon: num(v.handling),
      insuranceRate: num(v.insurance) / 100,
      scaleFee: num(v.scale),
      cities,
    });
  };

  return (
    <Card>
      <Heading level={3}>لجستیک و هزینهٔ حمل</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="مبدأ بارگیری" value={v.originLabel} onChange={(e) => setV({ ...v, originLabel: e.target.value })} />
        <TextInput label="نرخ حمل (تومان/تن‌کیلومتر)" inputMode="numeric" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
        <TextInput label="حداقل کرایهٔ سرویس (تومان)" inputMode="numeric" value={v.minTrip} onChange={(e) => setV({ ...v, minTrip: e.target.value })} />
        <TextInput label="بارگیری/تخلیه (تومان/تن)" inputMode="numeric" value={v.handling} onChange={(e) => setV({ ...v, handling: e.target.value })} />
        <TextInput label="بیمه (٪ ارزش کالا)" inputMode="decimal" value={v.insurance} onChange={(e) => setV({ ...v, insurance: e.target.value })} />
        <TextInput label="باسکول (تومان)" inputMode="numeric" value={v.scale} onChange={(e) => setV({ ...v, scale: e.target.value })} />
      </div>
      <Textarea
        label="شهرها (هر خط: نام,کیلومتر)"
        rows={6}
        value={v.cities}
        onChange={(e) => setV({ ...v, cities: e.target.value })}
      />
      <Button size="sm" style={{ marginBlockStart: 'var(--space-2)' }} loading={busy} onClick={submit}>
        ذخیرهٔ لجستیک
      </Button>
    </Card>
  );
}
