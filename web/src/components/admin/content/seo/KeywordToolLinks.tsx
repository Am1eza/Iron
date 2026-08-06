'use client';
/**
 * Two "open the research tool with this phrase" shortcuts under the
 * focus-keyword input (US-14.4).
 *
 * Anchors, not buttons: this navigates somewhere, so middle-click, ⌘-click and
 * "copy link address" all have to work, and a `<button onClick={window.open}>`
 * breaks every one of them.
 *
 * `rel="noreferrer"` alongside `target="_blank"`: `noopener` is implied by
 * `noreferrer` in every current browser, and there is no reason to tell
 * keywordchi which article draft the phrase came from.
 *
 * Nothing here claims a connection — see `lib/seo/keywordTools.ts` for why
 * neither site has a usable public API and what these URLs actually do.
 */
import { keywordToolLinks } from '@/lib/seo/keywordTools';
import s from './seoPanel.module.css';

export function KeywordToolLinks({ keyword }: { keyword: string }) {
  const links = keywordToolLinks(keyword);
  if (links.length === 0) {
    return (
      <div className={s.toolHint}>
        با نوشتن کلیدواژه، میان‌بُر جستجوی آن در «کیوردچی» و «گوگل ترندز» همین‌جا ظاهر می‌شود.
      </div>
    );
  }
  return (
    <>
      <div className={s.toolRow}>
        {links.map((link) => (
          <a
            key={link.id}
            className={s.toolLink}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            title={link.hint}
          >
            {link.label}
            <span aria-hidden="true">↗</span>
            <span className="visually-hidden">(در تب جدید باز می‌شود)</span>
          </a>
        ))}
      </div>
      <div className={s.toolHint}>
        این دکمه‌ها فقط سایت را با همین عبارت باز می‌کنند؛ هیچ عددی از آن‌ها به این پنل نمی‌آید.
      </div>
    </>
  );
}
