'use client';
/**
 * Alt text + caption, asked once, at the moment the picture goes in (US-12.4).
 *
 * The old flow never asked. Every image the panel has ever inserted is
 * `![](url)` — `alt=""` — which is simultaneously an SEO defect (Google reads
 * alt text) and an accessibility one (a screen reader announces nothing at
 * all). Asking later, in a settings panel somewhere, would be asking never.
 *
 * It is required-with-an-exit rather than optional: the primary button stays
 * disabled until either a description is written OR «تصویر تزئینی است» is
 * ticked. A purely decorative picture genuinely SHOULD have an empty alt, so
 * the exit is real and not a nag — but it has to be a decision someone made,
 * because an empty alt and an unwritten alt are indistinguishable afterwards.
 */
import { useEffect, useId, useState } from 'react';
import { Modal, Button, Alert } from '@/components/ui';
import type { ImageEditRequest } from './extensions/ArticleImage';
import s from './editor.module.css';

export function ImageDetailsDialog({
  open,
  initial,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initial: ImageEditRequest | null;
  onSubmit: (next: ImageEditRequest) => void;
  onClose: () => void;
}) {
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [decorative, setDecorative] = useState(false);
  const altId = useId();
  const capId = useId();
  const decId = useId();

  useEffect(() => {
    if (!open || !initial) return;
    setAlt(initial.alt ?? '');
    setCaption(initial.caption ?? '');
    setDecorative(Boolean(initial.decorative));
  }, [open, initial]);

  if (!initial) return null;
  const ready = decorative || alt.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="توضیح تصویر"
      footer={
        <>
          <Button
            type="button"
            disabled={!ready}
            onClick={() =>
              onSubmit({
                src: initial.src,
                alt: decorative ? '' : alt.trim(),
                caption: caption.trim(),
                decorative,
                width: initial.width,
                height: initial.height,
              })
            }
          >
            تأیید
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </>
      }
    >
      <div className={s.dialogBody}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={initial.src} alt="" className={s.dialogPreview} />

        <label className={s.field} htmlFor={altId}>
          <span className={s.fieldLabel}>این تصویر چه چیزی را نشان می‌دهد؟</span>
          <input
            id={altId}
            className={s.input}
            value={alt}
            maxLength={300}
            disabled={decorative}
            autoFocus
            placeholder="مثلاً: شاخه‌های میلگرد آجدار در انبار آهن‌تایم"
            onChange={(e) => setAlt(e.target.value)}
          />
          <span className={s.hint}>
            یک جملهٔ کوتاه و ساده. گوگل همین را می‌خواند و کسانی که تصویر را نمی‌بینند، همین برایشان خوانده می‌شود.
          </span>
        </label>

        <label className={s.checkboxRow} htmlFor={decId}>
          <input
            id={decId}
            type="checkbox"
            checked={decorative}
            onChange={(e) => setDecorative(e.target.checked)}
          />
          <span>
            این تصویر فقط تزئینی است و توضیحی لازم ندارد
            <span className={s.hint}>مثلاً یک بافت یا خط جداکننده؛ اگر عکس واقعی از محصول یا نمودار است، تیک نزنید.</span>
          </span>
        </label>

        <label className={s.field} htmlFor={capId}>
          <span className={s.fieldLabel}>زیرنویس (اختیاری)</span>
          <input
            id={capId}
            className={s.input}
            value={caption}
            maxLength={300}
            placeholder="متنی که زیر تصویر، برای همه، نمایش داده می‌شود"
            onChange={(e) => setCaption(e.target.value)}
          />
          <span className={s.hint}>
            زیرنویس با متن جایگزین فرق دارد: زیرنویس را همه می‌بینند، متن جایگزین را فقط گوگل و صفحه‌خوان‌ها.
          </span>
        </label>

        {!ready ? (
          <Alert tone="info">
            برای ادامه، یا توضیح تصویر را بنویسید یا تیک «تزئینی» را بزنید. این کار کمتر از ده ثانیه وقت می‌گیرد و
            رتبهٔ مقاله در گوگل را واقعاً بهتر می‌کند.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}
