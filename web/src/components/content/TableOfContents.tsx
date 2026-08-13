/**
 * Article table of contents — «فهرست مطالب» (US-mobile-toc).
 *
 * A Server Component: it derives its links from the SAME `RichDoc` the body
 * renders, and the anchor ids it points at (`heading-{i}`) are the ones
 * `RichContent` stamps on each heading, keyed by the block's index in
 * `doc.content`. Both walk that array, so the ids line up by construction —
 * there is no id-generation that could drift between the two.
 *
 * Plain anchor links, no client JS: the jump works without hydration, and the
 * smooth scroll + sticky-header offset are pure CSS (`scroll-behavior` on the
 * root, `scroll-margin` on the headings). Rendered only when the article has
 * real structure (>= 3 headings); a one- or two-line list is noise.
 */
import type { RichDoc, InlineNode } from '@/lib/content/richDoc';
import styles from './TableOfContents.module.css';

function inlineText(nodes: InlineNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes.map((n) => ('text' in n && n.text ? n.text : '')).join('');
}

type TocItem = { id: string; level: 2 | 3; text: string };

export function tocItems(doc: RichDoc): TocItem[] {
  const items: TocItem[] = [];
  (doc.content ?? []).forEach((block, i) => {
    if (block.type !== 'heading') return;
    const text = inlineText(block.content).trim();
    if (!text) return; // an empty heading would be a dead, unlabelled link
    items.push({ id: `heading-${i}`, level: block.attrs.level, text });
  });
  return items;
}

export function TableOfContents({ doc }: { doc: RichDoc }) {
  const items = tocItems(doc);
  if (items.length < 3) return null;
  return (
    <nav className={styles.toc} aria-labelledby="toc-title">
      <p id="toc-title" className={styles.title}>
        فهرست مطالب
      </p>
      <ol className={styles.list}>
        {items.map((it) => (
          <li key={it.id} className={it.level === 3 ? styles.sub : styles.item}>
            <a href={`#${it.id}`} className={styles.link}>
              {it.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
