'use client';
/**
 * The traffic-light on-page SEO panel beside the article editor (US-14.4).
 *
 * All of the thinking is in `lib/seo/onPageAudit.ts` — this file only renders
 * it. That split is deliberate: the audit is a pure function with a test file
 * of its own, and none of its Persian-language edge cases need a DOM to be
 * proven.
 *
 * ACCESSIBILITY. The status of a row is carried three ways at once: colour,
 * a distinct glyph, and a visually-hidden Persian word. Green/amber/red alone
 * would be exactly the kind of colour-only signal `design/accessibility.md`
 * forbids, and this panel's whole job is to be read at a glance.
 *
 * There is no `aria-live` region. The audit re-runs on every keystroke, and
 * announcing twelve check results while someone is mid-sentence would make
 * the editor unusable with a screen reader on. The panel is a reference the
 * author consults, not an alert stream.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { auditArticleSeo, type SeoAuditInput, type SeoCheck, type SeoCheckStatus } from '@/lib/seo/onPageAudit';
import s from './seoPanel.module.css';

const STATUS_GLYPH: Record<SeoCheckStatus, string> = {
  good: '✓',
  warn: '!',
  bad: '✕',
  idle: '–',
};

const STATUS_WORD: Record<SeoCheckStatus, string> = {
  good: 'خوب',
  warn: 'نیاز به بهبود',
  bad: 'مشکل',
  idle: 'بررسی‌نشده',
};

const OVERALL_LABEL: Record<SeoCheckStatus, string> = {
  good: 'سئوی این صفحه خوب است',
  warn: 'چند مورد قابل بهبود',
  bad: 'موارد مهمی باقی مانده',
  idle: 'هنوز چیزی برای بررسی نیست',
};

function CheckRow({ check }: { check: SeoCheck }) {
  return (
    <li className={s.item}>
      <span className={`${s.dot} ${s[check.status]}`} aria-hidden="true">
        {STATUS_GLYPH[check.status]}
      </span>
      {/* A <div>, not a <span>: the message below is flow content, and a
          <div> inside a <span> is invalid nesting browsers merely tolerate. */}
      <div>
        <span className={s.itemLabel}>
          {check.label}
          {/* Read out as «طول عنوان: مشکل — …» rather than as an unlabelled
              bullet whose colour the listener cannot see. */}
          <span className="visually-hidden">: {STATUS_WORD[check.status]}</span>
        </span>
        <div className={s.itemMessage}>{check.message}</div>
      </div>
    </li>
  );
}

export function SeoChecklist(props: SeoAuditInput) {
  // Recomputed on every keystroke, which is the point — but only when
  // something it actually reads has changed.
  const audit = useMemo(
    () =>
      auditArticleSeo({
        title: props.title,
        seoTitle: props.seoTitle,
        seoDescription: props.seoDescription,
        excerpt: props.excerpt,
        slug: props.slug,
        focusKeyword: props.focusKeyword,
        doc: props.doc,
      }),
    [props.title, props.seoTitle, props.seoDescription, props.excerpt, props.slug, props.focusKeyword, props.doc],
  );

  const [showAll, setShowAll] = useState(false);
  const problems = audit.checks.filter((c) => c.status === 'warn' || c.status === 'bad');
  // With problems open, the passing rows are noise; with none, the list is
  // short enough that hiding it would just look broken.
  const visible = showAll || problems.length === 0 ? audit.checks : problems;
  const hiddenCount = audit.checks.length - visible.length;
  const fa = new Intl.NumberFormat('fa-IR');

  return (
    <div>
      <div className={s.summary}>
        <span className={`${s.overall} ${s[audit.overall]}`}>
          <span aria-hidden="true">{STATUS_GLYPH[audit.overall]}</span>
          {OVERALL_LABEL[audit.overall]}
        </span>
        <span className={`${s.summaryCounts} tnum`}>{fa.format(audit.wordCount)} کلمه</span>
      </div>
      <ul className={s.list}>
        {visible.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
      {/* ONE button whose label swaps, not two mutually exclusive ones.
          Rendering a different element per state unmounted the control the
          user had just activated, dropping keyboard focus to <body> in the
          middle of the panel with nothing announced. */}
      {problems.length > 0 && audit.checks.length > problems.length ? (
        <Button size="sm" variant="ghost" aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'فقط موارد نیازمند اصلاح' : `نمایش ${fa.format(hiddenCount)} مورد سالم`}
        </Button>
      ) : null}
    </div>
  );
}
