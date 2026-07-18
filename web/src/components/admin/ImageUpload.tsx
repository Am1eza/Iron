'use client';
/** Shared admin image upload (US-20.2) — article cover, SKU/category photo.
 *  Client-side type/size checks are a fast first pass only; the server's
 *  magic-byte sniff (`api/admin/upload`) is the real security boundary. */
import { useId, useRef, useState } from 'react';
import { adminApi } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui';
import styles from './ImageUpload.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errId = useId();

  const handleFile = async (file: File) => {
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('فقط تصاویر JPG، PNG یا WebP مجاز است.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('حجم فایل نباید از ۵ مگابایت بیشتر باشد.');
      return;
    }
    setBusy(true);
    try {
      const { url } = await adminApi.uploadImage(file);
      // The server returns a same-origin relative path (`/uploads/...`); a
      // few consumers (article `coverUrl`/`seo.ogImage`) validate as a full
      // URL server-side, and Open Graph image tags require an absolute URL
      // by spec anyway — so this is the one place that resolves it, once.
      onChange(new URL(url, window.location.origin).toString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'آپلود ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={styles.preview} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
        <div className={styles.actions}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'تعویض تصویر' : 'انتخاب تصویر'}
          </Button>
          {value && !busy ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              حذف
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          aria-describedby={error ? errId : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error ? (
        <p id={errId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
