'use client';
/**
 * Insert/edit a link (US-12.4).
 *
 * The old toolbar inserted the literal string `[متن پیوند](https://)` into a
 * textarea and left the writer to fill in the two halves without breaking the
 * brackets. This asks for the two things a link actually is, in words, and
 * offers the site's own pages as one-click destinations — internal linking is
 * the single highest-value SEO habit an editorial team can have, and it was
 * previously gated behind knowing the URL by heart.
 */
import { useEffect, useId, useState } from 'react';
import { Modal, Button, Chip } from '@/components/ui';
import { routes } from '@/lib/routes';
import { safeHref } from '@/lib/content/richDoc';
import s from './editor.module.css';

const INTERNAL_PRESETS: Array<{ label: string; path: string }> = [
  { label: 'صفحهٔ اصلی', path: routes.home() },
  { label: 'قیمت‌ها', path: routes.prices() },
  { label: 'وبلاگ', path: routes.blog() },
  { label: 'اخبار', path: routes.news() },
];

/** «ahantime.com/x» typed without a scheme is a link the writer means; making
 *  them type `https://` is friction with no upside. A path («/prices») is left
 *  exactly as-is — it is already a valid internal link. */
function coerceHref(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v)) return v;
  return `https://${v}`;
}

export function LinkDialog({
  open,
  initialText,
  initialHref,
  hasSelection,
  onSubmit,
  onRemove,
  onClose,
}: {
  open: boolean;
  initialText: string;
  initialHref: string;
  /** When the caret is inside an existing link, the dialog also offers to
   *  take it off — otherwise there is no discoverable way to undo one. */
  hasSelection: boolean;
  onSubmit: (args: { text: string; href: string }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [href, setHref] = useState('');
  const textId = useId();
  const hrefId = useId();

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setHref(initialHref);
  }, [open, initialText, initialHref]);

  const coerced = coerceHref(href);
  const valid = Boolean(safeHref(coerced)) && coerced !== '';
  const ready = valid && text.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialHref ? 'ویرایش پیوند' : 'افزودن پیوند'}
      footer={
        <>
          <Button type="button" disabled={!ready} onClick={() => onSubmit({ text: text.trim(), href: coerced })}>
            {initialHref ? 'ذخیرهٔ پیوند' : 'افزودن پیوند'}
          </Button>
          {initialHref ? (
            <Button type="button" variant="ghost" onClick={onRemove}>
              برداشتن پیوند
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </>
      }
    >
      <div className={s.dialogBody}>
        <label className={s.field} htmlFor={textId}>
          <span className={s.fieldLabel}>متنی که خوانده می‌شود</span>
          <input
            id={textId}
            className={s.input}
            value={text}
            maxLength={200}
            autoFocus={!hasSelection}
            placeholder="مثلاً قیمت روز میلگرد"
            onChange={(e) => setText(e.target.value)}
          />
          <span className={s.hint}>
            به‌جای «اینجا کلیک کنید»، بنویسید مقصد چیست؛ هم برای خواننده روشن‌تر است هم برای گوگل.
          </span>
        </label>

        <label className={s.field} htmlFor={hrefId}>
          <span className={s.fieldLabel}>آدرس مقصد</span>
          <input
            id={hrefId}
            className={s.input}
            dir="ltr"
            value={href}
            maxLength={500}
            autoFocus={hasSelection}
            placeholder="https://…  یا  /prices"
            onChange={(e) => setHref(e.target.value)}
          />
          {href.trim() && !valid ? <span className={s.errorHint}>این آدرس معتبر نیست.</span> : null}
        </label>

        <div>
          <span className={s.fieldLabel}>صفحه‌های خود سایت</span>
          <div className={s.presetRow}>
            {INTERNAL_PRESETS.map((p) => (
              <Chip key={p.path} selected={coerced === p.path} onClick={() => setHref(p.path)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
