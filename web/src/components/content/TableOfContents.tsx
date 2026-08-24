/**
 * Article table of contents — «فهرست مطالب» (US-mobile-toc).
 *
 * A Server Component: it derives its links from the SAME `RichDoc` the body
 * renders, and the anchor ids it points at (`heading-{i}`) are the ones
 * `RichContent` stamps on each heading, keyed by the block's index in
 * `doc.content`. Both walk that array, so the ids line up by construction —
 * there is no id-generation that could drift between the two.
 *
 * Grouped by H2, capped at `MAX_VISIBLE_GROUPS` top-level entries, H3s
 * collapsed under their parent by default — a 25+ heading article used to
 * list every H2 AND H3 expanded, filling most of the first viewport before
 * any article content. The collapse/expand is native <details>/<summary>
 * (same pattern as ArticleFaq), so it needs no client JS and the content
 * stays crawlable while closed. Jump links stay plain <a href="#...">
 * outside the <summary> — an interactive link nested inside a `<summary>`
 * (itself an implicit disclosure control) is the kind of nested-interactive
 * markup axe flags, so each `<li>` puts the link and the toggle as SIBLINGS,
 * never one inside the other (see ArticleFaq.tsx's own comment on why its
 * summary holds a plain heading, not a link, for the same reason).
 *
 * Rendered only when the article has real structure (>= 3 headings); a
 * one- or two-line list is noise.
 */
import type { RichDoc, InlineNode } from '@/lib/content/richDoc';
import { toPersianDigits } from '@/lib/utils/format';
import { ChevronDownIcon } from '@/components/primitives/icons';
import styles from './TableOfContents.module.css';

function inlineText(nodes: InlineNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes.map((n) => ('text' in n && n.text ? n.text : '')).join('');
}

type TocItem = { id: string; level: 2 | 3; text: string };
type TocGroup = { id: string; text: string; children: TocItem[] };

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

/** An H3 with no preceding H2 (malformed/legacy content) becomes its own
 *  top-level entry rather than being silently dropped. */
function groupByH2(items: TocItem[]): TocGroup[] {
  const groups: TocGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (item.level === 3 && last) {
      last.children.push(item);
    } else {
      groups.push({ id: item.id, text: item.text, children: [] });
    }
  }
  return groups;
}

const MAX_VISIBLE_GROUPS = 8;

function TocGroupItem({ group }: { group: TocGroup }) {
  return (
    <li className={styles.item}>
      <a href={`#${group.id}`} className={styles.link}>
        {group.text}
      </a>
      {group.children.length > 0 ? (
        <details className={styles.group}>
          <summary className={styles.groupSummary} aria-label={`نمایش زیربخش‌های ${group.text}`}>
            <span aria-hidden="true" className={styles.groupSummaryText}>
              {toPersianDigits(group.children.length)} زیربخش
            </span>
            <ChevronDownIcon size={14} className={styles.chevron} aria-hidden="true" />
          </summary>
          <ol className={styles.subList}>
            {group.children.map((h3) => (
              <li key={h3.id} className={styles.sub}>
                <a href={`#${h3.id}`} className={styles.link}>
                  {h3.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

export function TableOfContents({ doc }: { doc: RichDoc }) {
  const items = tocItems(doc);
  if (items.length < 3) return null;
  const groups = groupByH2(items);
  const visible = groups.slice(0, MAX_VISIBLE_GROUPS);
  const rest = groups.slice(MAX_VISIBLE_GROUPS);

  return (
    <nav className={styles.toc} aria-labelledby="toc-title">
      <p id="toc-title" className={styles.title}>
        فهرست مطالب
      </p>
      <ol className={styles.list}>
        {visible.map((g) => (
          <TocGroupItem key={g.id} group={g} />
        ))}
        {rest.length > 0 ? (
          <li className={styles.item}>
            <details className={styles.group}>
              <summary className={styles.groupSummary}>
                <span className={styles.groupSummaryText}>
                  {toPersianDigits(rest.length)} مورد دیگر
                </span>
                <ChevronDownIcon size={14} className={styles.chevron} aria-hidden="true" />
              </summary>
              <ol className={styles.subList}>
                {rest.map((g) => (
                  <TocGroupItem key={g.id} group={g} />
                ))}
              </ol>
            </details>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
