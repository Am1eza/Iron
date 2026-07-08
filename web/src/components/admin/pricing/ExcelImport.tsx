'use client';
/**
 * «ورود قیمت از اکسل» — download the pre-filled template, edit the قیمت column,
 * upload it back. The server parses + matches (POST /api/admin/pricing/import,
 * read-only preview); saving goes through the SAME bulk PUT the grid uses, so
 * movement/history/audit are identical to hand-entry.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits, formatToman } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, Heading, Text } from '@/components/ui';
import { DownloadIcon } from '@/components/primitives/icons';
import ui from '../adminUi.module.css';

interface MatchedRow {
  skuId: string;
  name: string;
  currentPrice: number | null;
  newPrice: number;
}
interface UnmatchedRow {
  row: number;
  name: string;
  reason: string;
}

export function ExcelImport() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ matched: MatchedRow[]; unmatched: UnmatchedRow[] } | null>(null);
  const [parsing, setParsing] = useState(false);

  const upload = async (file: File) => {
    setParsing(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/pricing/import', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'خواندن فایل ناموفق بود.');
      setPreview({ matched: body.matched ?? [], unmatched: body.unmatched ?? [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خواندن فایل ناموفق بود.');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apply = useMutation({
    mutationFn: () =>
      adminApi.savePrices((preview?.matched ?? []).map((m) => ({ skuId: m.skuId, price: m.newPrice }))),
    onSuccess: (res) => {
      toast.success(`${toPersianDigits(res.saved)} قیمت ذخیره شد${res.failed ? `؛ ${toPersianDigits(res.failed)} ناموفق` : ''}.`);
      setPreview(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: () => toast.error('ذخیرهٔ قیمت‌ها ناموفق بود.'),
  });

  const changed = (preview?.matched ?? []).filter((m) => m.currentPrice !== m.newPrice);

  return (
    <section className={ui.panel} aria-labelledby="xlsx-import">
      <Heading level={2} id="xlsx-import">
        ورود قیمت از اکسل
      </Heading>
      <Text color="muted">
        قالب را دانلود کنید، ستون «قیمت» را ویرایش کنید و همان فایل را بارگذاری کنید — پیش‌نمایش را
        می‌بینید و بعد تأیید می‌کنید.
      </Text>

      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <a href="/api/admin/pricing/template" className={ui.mono} download style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-accent-text)' }}>
          <DownloadIcon size={16} aria-hidden="true" />
          دانلود قالب اکسل (با قیمت‌های فعلی)
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="بارگذاری فایل اکسل قیمت"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        {parsing ? <span className={ui.muted}>در حال خواندن فایل…</span> : null}
      </div>

      {preview ? (
        <div style={{ marginBlockStart: 'var(--space-4)', display: 'grid', gap: 'var(--space-4)' }}>
          <div className={ui.toolbar}>
            <Badge tone="success">{toPersianDigits(preview.matched.length)} ردیف شناسایی شد</Badge>
            <Badge tone="accent">{toPersianDigits(changed.length)} قیمت تغییر می‌کند</Badge>
            {preview.unmatched.length > 0 ? (
              <Badge tone="loss">{toPersianDigits(preview.unmatched.length)} ردیف نامعتبر</Badge>
            ) : null}
          </div>

          {changed.length > 0 ? (
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">کالا</th>
                  <th scope="col">قیمت فعلی</th>
                  <th scope="col">قیمت جدید</th>
                </tr>
              </thead>
              <tbody>
                {changed.slice(0, 50).map((m) => (
                  <tr key={m.skuId}>
                    <td>{m.name}</td>
                    <td className="tnum">{m.currentPrice ? formatToman(m.currentPrice, false) : '—'}</td>
                    <td className="tnum" style={{ fontWeight: 700 }}>
                      {formatToman(m.newPrice, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Text color="muted">هیچ قیمتی نسبت به حال حاضر تغییر نکرده است.</Text>
          )}
          {changed.length > 50 ? (
            <Text color="muted">… و {toPersianDigits(changed.length - 50)} ردیف دیگر</Text>
          ) : null}

          {preview.unmatched.length > 0 ? (
            <details>
              <summary className={ui.muted}>ردیف‌های نامعتبر ({toPersianDigits(preview.unmatched.length)})</summary>
              <ul className={ui.muted}>
                {preview.unmatched.slice(0, 30).map((u) => (
                  <li key={u.row} className="tnum">
                    سطر {toPersianDigits(u.row)}: {u.name} — {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className={ui.toolbar}>
            <Button onClick={() => apply.mutate()} disabled={changed.length === 0} loading={apply.isPending}>
              ثبت {toPersianDigits(changed.length)} قیمت
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              انصراف
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
