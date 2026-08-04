import type { ReactNode } from 'react';
import type { Article } from '@/lib/types/domain';
import styles from './ArticleBody.module.css';
import { BODIES, type Block } from './legacyBodies';

/**
 * Rich Persian prose renderer for an article. The mock data only carries a
 * title + excerpt, so we synthesize a genuinely readable, on-topic editorial
 * body (deterministically, per article) — paragraphs, a sub-heading, a bullet
 * list and a closing note. No Date.now/Math.random: the content is keyed off the
 * stable article slug/id, so SSR and client render identically.
 */


function fallbackBody(article: Article): Block[] {
  const lead =
    article.excerpt ??
    `در این ${article.type === 'news' ? 'خبر' : 'مطلب'}، به بررسی «${article.title}» می‌پردازیم.`;
  return [
    {
      kind: 'p',
      text: `${lead} در بازار آهن و فولاد، تصمیم درست بیش از هر چیز به اطلاعات به‌روز و شناخت روند قیمت بستگی دارد؛ همان چیزی که در این نوشته به آن می‌پردازیم.`,
    },
    {
      kind: 'p',
      text: 'قیمت مقاطع فولادی هم‌زمان از چند عامل اثر می‌پذیرد: نرخ شمش فولاد، نوسان ارز، حجم عرضه در بورس کالا و تقاضای فصلی پروژه‌های ساختمانی. شناخت این عوامل به خریدار کمک می‌کند فضای بازار را بهتر بخواند و خرید خود را هوشمندانه‌تر برنامه‌ریزی کند.',
    },
    { kind: 'h2', text: 'نکته‌های کلیدی برای خرید آگاهانه' },
    {
      kind: 'ul',
      items: [
        'قیمت لحظه‌ای را پیش از هر سفارش بررسی کنید و به نوسان روزانه توجه داشته باشید.',
        'خرید حجم بالا را در صورت امکان به چند مرحله تقسیم کنید تا ریسک نوسان کم شود.',
        'پیش از تصمیم نهایی، استاندارد و کارخانهٔ سازنده را با نیاز پروژه تطبیق دهید.',
      ],
    },
    {
      kind: 'quote',
      text: 'اول مشورت، بعد خرید؛ یک تصمیم آگاهانه از یک پیش‌بینی خوش‌بینانه ارزشمندتر است.',
    },
    {
      kind: 'p',
      text: 'برای دریافت قیمت روز و راهنمایی متناسب با پروژهٔ خود، قیمت‌های آهن‌تایم را دنبال کنید و با کارشناسان ما در ارتباط باشید.',
    },
  ];
}

/** Inline markdown → React: `**bold**` and `[label](url)`. The admin editor's
 *  toolbar inserts exactly these two tokens — without this, both the editor
 *  preview AND the published article showed the literal asterisks/brackets. */
/**
 * Only schemes that can't execute. `renderInline` builds an <a href> straight
 * from `[label](url)`, and while React 19 does neutralise `javascript:` at the
 * DOM layer, relying on a framework internal as the only control is the wrong
 * posture for a field that editors (and, in future, generated drafts) fill in.
 * Anything else renders as plain text rather than a link.
 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url.trim()) ? url.trim() : null;
}

/** External links get noreferrer + nofollow; internal ones stay clean. */
function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function renderInline(text: string): ReactNode {
  // Bold before italic: `**x**` must not be read as `*` + `*x*` + `*`. The
  // italic branch must also not fire on a `*` that follows another `*`.
  //
  // That guard used to be a lookbehind, `(?<!\*)`. Lookbehind is unsupported
  // in Safari before 16.4, and an unsupported group is a SYNTAX error — the
  // whole script chunk fails to parse, so this did not degrade to unformatted
  // text, it blanked every article page on those browsers. Expressed instead
  // as a captured preceding character (empty at the start of the string),
  // which is re-emitted as text below so nothing is swallowed.
  const re = /\*\*([^*]+)\*\*|(^|[^*])\*([^*]+)\*(?!\*)|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`b${k++}`}>{m[1]}</strong>);
    } else if (m[3] !== undefined) {
      // m[2] is the character the italic run had to be preceded by; it is part
      // of the match only so it can be tested, so it goes straight back out.
      if (m[2]) parts.push(m[2]);
      parts.push(<em key={`i${k++}`}>{m[3]}</em>);
    } else {
      const href = safeHref(m[5]!);
      if (href) {
        parts.push(
          <a
            key={`a${k++}`}
            href={href}
            rel={isExternal(href) ? 'noopener noreferrer nofollow' : 'noopener'}
          >
            {m[4]}
          </a>,
        );
      } else {
        // A rejected scheme still shows its label — dropping the text silently
        // would make the sentence read as if a word were missing.
        parts.push(<span key={`a${k++}`}>{m[4]}</span>);
      }
    }
    last = re.lastIndex;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.kind) {
    case 'h2':
      return (
        <h2 key={index} className={styles.h2}>
          {renderInline(block.text)}
        </h2>
      );
    case 'ul':
      return (
        <ul key={index} className={styles.ul}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'h3':
      return (
        <h3 key={index} className={styles.h3}>
          {renderInline(block.text)}
        </h3>
      );
    case 'ol':
      return (
        <ol key={index} className={styles.ol}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case 'table':
      return (
        // WCAG 2.1.1 Keyboard: a region that scrolls must be reachable by
        // keyboard, or a keyboard-only user can never see the columns past
        // the fold. tabindex="0" makes it focusable and role+name mean the
        // focus stop announces itself instead of being a silent empty stop.
        <div
          key={index}
          className={styles.tableWrap}
          role="region"
          aria-label="جدول مطلب"
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'img':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={index} className={styles.img} src={block.src} alt={block.alt} loading="lazy" />
      );
    case 'quote':
      return (
        <blockquote key={index} className={styles.quote}>
          {renderInline(block.text)}
        </blockquote>
      );
    case 'p':
    default:
      return (
        <p key={index} className={styles.p}>
          {renderInline(block.text)}
        </p>
      );
  }
}

/** The SAME markdown pipeline the published article uses, as a standalone
 *  surface — the admin editor preview renders through this so preview and
 *  production can never drift apart again. */
export function MarkdownProse({ md }: { md: string }) {
  return <div className={styles.prose}>{blocksFromMarkdown(md).map(renderBlock)}</div>;
}

/** Minimal markdown → blocks (paragraphs, ## headings, - lists, > quotes). */
function blocksFromMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const chunks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    // A lone `![alt](url)` line is a standalone image, not a paragraph — the
    // renderer previously had no way to embed a picture in the body at all.
    if (lines.length === 1) {
      const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(lines[0]!);
      if (img) {
        const src = safeHref(img[2]!);
        if (src) {
          blocks.push({ kind: 'img', src, alt: img[1] ?? '' });
          continue;
        }
      }
    }
    // GFM pipe table: a header row, a |---|---| separator, then body rows.
    if (lines.length >= 2 && lines[0]!.includes('|') && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[1]!)) {
      const cells = (l: string) =>
        l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      blocks.push({
        kind: 'table',
        head: cells(lines[0]!),
        rows: lines.slice(2).map(cells),
      });
    } else if (lines.every((l) => l.startsWith('- ') || l.startsWith('* '))) {
      blocks.push({ kind: 'ul', items: lines.map((l) => l.slice(2).trim()) });
    } else if (lines.every((l) => /^\d+[.)]\s/.test(l))) {
      blocks.push({ kind: 'ol', items: lines.map((l) => l.replace(/^\d+[.)]\s*/, '').trim()) });
    } else if (lines[0]!.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: lines[0]!.slice(4).trim() });
      const rest = lines.slice(1).join(' ').trim();
      if (rest) blocks.push({ kind: 'p', text: rest });
    } else if (lines[0]!.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: lines[0]!.slice(3).trim() });
      const rest = lines.slice(1).join(' ').trim();
      if (rest) blocks.push({ kind: 'p', text: rest });
    } else if (lines[0]!.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: lines.map((l) => l.replace(/^> ?/, '')).join(' ') });
    } else {
      blocks.push({ kind: 'p', text: lines.join(' ') });
    }
  }
  return blocks;
}

export function ArticleBody({ article }: { article: Article }) {
  // The stored body ALWAYS wins. The old order had `!BODIES[article.slug]` in
  // front of it, and because that map is keyed by the seven slugs that exist in
  // production, the mock won every time: an editor could rewrite an article,
  // watch the admin preview change, save, and the public page never moved.
  // `scripts/migrateArticleBodies.ts` has copied the curated prose into
  // `body_md`, so BODIES is now only a safety net for a row with an empty body.
  const blocks = article.bodyMd?.trim()
    ? blocksFromMarkdown(article.bodyMd)
    : (BODIES[article.slug] ?? fallbackBody(article));
  return <div className={styles.prose}>{blocks.map(renderBlock)}</div>;
}
