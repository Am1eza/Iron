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
function renderInline(text: string): ReactNode {
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`b${k++}`}>{m[1]}</strong>);
    } else {
      parts.push(
        <a key={`a${k++}`} href={m[3]} rel="noopener">
          {m[2]}
        </a>,
      );
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
    if (lines.every((l) => l.startsWith('- ') || l.startsWith('* '))) {
      blocks.push({ kind: 'ul', items: lines.map((l) => l.slice(2).trim()) });
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
