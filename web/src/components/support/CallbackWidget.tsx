'use client';
/**
 * «درخواست تماس» — a floating quick-callback widget on the public site. The
 * visitor leaves a name + mobile (+ optional note) and the sales team calls
 * back; it files into the same admin inbox (POST /api/contact) that rings the
 * panel (see AdminAlerts). Zero-friction: no login, one field that matters.
 */
import { useState } from 'react';
import { http } from '@/lib/api/http';
import { normalizeMobile } from '@/lib/utils/format';
import { PhoneIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './CallbackWidget.module.css';

export function CallbackWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const m = normalizeMobile(mobile);
    if (!name.trim()) return setErr('نام خود را وارد کنید.');
    if (!m) return setErr('شمارهٔ موبایل معتبر وارد کنید.');
    setBusy(true);
    try {
      await http.post('/api/contact', {
        name: name.trim(),
        mobile: m,
        message: `درخواست تماس${note.trim() ? ` — ${note.trim()}` : ''}`,
      });
      setDone(true);
    } catch {
      setErr('ارسال ناموفق بود. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="درخواست تماس">
          {done ? (
            <div className={styles.done}>
              <span className={styles.doneIcon} aria-hidden="true">
                <CheckCircleIcon size={32} />
              </span>
              <p className={styles.doneTitle}>درخواست شما ثبت شد</p>
              <p className={styles.doneLead}>کارشناسان ما به‌زودی با شما تماس می‌گیرند.</p>
              <button type="button" className={styles.close} onClick={() => setOpen(false)}>
                بستن
              </button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              <div className={styles.head}>
                <strong>درخواست تماس رایگان</strong>
                <button type="button" className={styles.x} onClick={() => setOpen(false)} aria-label="بستن">
                  ✕
                </button>
              </div>
              <p className={styles.hint}>شماره‌تان را بگذارید، کارشناس ما تماس می‌گیرد.</p>
              <input className={styles.input} placeholder="نام" value={name} onChange={(e) => setName(e.target.value)} />
              <input
                className={styles.input}
                dir="ltr"
                inputMode="tel"
                placeholder="۰۹xxxxxxxxx"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
              <input
                className={styles.input}
                placeholder="موضوع (اختیاری)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {err ? <p className={styles.err}>{err}</p> : null}
              <button type="submit" className={styles.submit} disabled={busy}>
                {busy ? 'در حال ثبت…' : 'درخواست تماس'}
              </button>
            </form>
          )}
        </div>
      ) : null}
      <button
        type="button"
        className={styles.fab}
        onClick={() => {
          setOpen((o) => !o);
          setDone(false);
        }}
        aria-label="درخواست تماس"
        aria-expanded={open}
      >
        <PhoneIcon size={22} />
        <span className={styles.fabLabel}>تماس بگیرید</span>
      </button>
    </div>
  );
}
