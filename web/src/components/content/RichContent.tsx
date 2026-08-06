/**
 * The article body renderer — `RichDoc` → React (US-12.4).
 *
 * THIS IS THE ONLY RENDERER. The public article page (`/blog/[slug]`,
 * `/news/[slug]`) and the admin editor's preview both go through it, because
 * "the preview showed something the reader never got" is a bug this codebase
 * has already shipped twice: once when the drawer had its own hand-rolled
 * preview that dropped bold and links, and once when `ArticleBody` preferred a
 * hardcoded prose map over the stored body, so an editor could rewrite an
 * article, watch the preview change, save, and see the public page never move.
 *
 * It is a Server Component and imports nothing from Tiptap or ProseMirror: an
 * anonymous reader downloads no part of the editing runtime. Everything the
 * editor needs on top of this — input handling, menus, node views — lives in
 * `components/admin/content/editor` and is loaded only inside the panel.
 */
import type { ReactNode } from 'react';
import type {
  BlockNode,
  InlineNode,
  ParagraphNode,
  RichDoc,
  TableCellNode,
} from '@/lib/content/richDoc';
import { isExternal, safeHref } from '@/lib/content/richDoc';
import { ArticleChart } from './ArticleChart';
import styles from './RichContent.module.css';

/* ------------------------------- inline -------------------------------- */

function renderInline(nodes: InlineNode[] | undefined, keyBase: string): ReactNode {
  if (!nodes?.length) return null;
  return nodes.map((node, i) => {
    const key = `${keyBase}-${i}`;
    if (node.type === 'hardBreak') return <br key={key} />;
    if (!node.text) return null;
    // Unmarked text renders as a bare string, NOT wrapped in a <span>: an
    // extra element per run splits a word across DOM nodes for anything
    // reading the page (screen readers, Google, `getByText`) with no upside.
    if (!node.marks?.length) return node.text;
    let out: ReactNode = node.text;
    for (const mark of node.marks) {
      if (mark.type === 'bold') out = <strong key={key}>{out}</strong>;
      else if (mark.type === 'italic') out = <em key={key}>{out}</em>;
      else if (mark.type === 'link') {
        const href = safeHref(mark.attrs?.href ?? '');
        // A rejected scheme still shows its label — dropping the text would
        // make the sentence read as if a word were missing.
        out = href ? (
          <a key={key} href={href} rel={isExternal(href) ? 'noopener noreferrer nofollow' : 'noopener'}>
            {out}
          </a>
        ) : (
          <span key={key}>{out}</span>
        );
      }
    }
    // `out` is already a keyed element by now — an extra wrapper would only
    // add another node between the mark and its text.
    return out;
  });
}

/* -------------------------------- table -------------------------------- */

function cellContent(cell: TableCellNode, key: string): ReactNode {
  // A table cell holds paragraphs; readers see them as one run of text with
  // line breaks, not as separately-spaced blocks.
  return (cell.content ?? []).map((p, i) => (
    <span key={`${key}-p${i}`} className={styles.cellLine}>
      {renderInline(p.content, `${key}-p${i}`)}
    </span>
  ));
}

function renderCell(cell: TableCellNode, key: string, inHead: boolean): ReactNode {
  const attrs = {
    colSpan: cell.attrs?.colspan && cell.attrs.colspan > 1 ? cell.attrs.colspan : undefined,
    rowSpan: cell.attrs?.rowspan && cell.attrs.rowspan > 1 ? cell.attrs.rowspan : undefined,
  };
  return cell.type === 'tableHeader' ? (
    // `scope` is what lets a screen reader say "سایز، ۱۴" instead of reading a
    // wall of unattached numbers. A header in the first row labels a column;
    // one appearing later in a body row labels that row.
    <th key={key} scope={inHead ? 'col' : 'row'} {...attrs}>
      {cellContent(cell, key)}
    </th>
  ) : (
    <td key={key} {...attrs}>
      {cellContent(cell, key)}
    </td>
  );
}

function renderTable(node: Extract<BlockNode, { type: 'table' }>, key: string): ReactNode {
  const rows = node.content ?? [];
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const hasHeadRow = (first.content ?? []).length > 0 && (first.content ?? []).every((c) => c.type === 'tableHeader');
  const bodyRows = hasHeadRow ? rows.slice(1) : rows;
  return (
    // WCAG 2.1.1 Keyboard: a region that scrolls must be reachable by keyboard,
    // or a keyboard-only user can never see the columns past the fold.
    // tabindex="0" makes it focusable; role + name mean the focus stop
    // announces itself instead of being a silent, empty one.
    <div key={key} className={styles.tableWrap} role="region" aria-label="جدول مطلب" tabIndex={0}>
      <table className={styles.table}>
        {hasHeadRow ? (
          <thead>
            <tr>{(first.content ?? []).map((c, i) => renderCell(c, `${key}-h${i}`, true))}</tr>
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row, r) => (
            <tr key={`${key}-r${r}`}>{(row.content ?? []).map((c, i) => renderCell(c, `${key}-r${r}c${i}`, false))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- blocks ------------------------------- */

function renderBlock(node: BlockNode, index: number, eagerImage = false): ReactNode {
  const key = `b${index}`;
  switch (node.type) {
    case 'heading':
      return node.attrs.level === 3 ? (
        <h3 key={key} className={styles.h3}>
          {renderInline(node.content, key)}
        </h3>
      ) : (
        <h2 key={key} className={styles.h2}>
          {renderInline(node.content, key)}
        </h2>
      );
    case 'bulletList':
      return (
        <ul key={key} className={styles.ul}>
          {(node.content ?? []).map((li, i) => (
            <li key={`${key}-${i}`}>{(li.content ?? []).map((p, j) => renderInline(p.content, `${key}-${i}-${j}`))}</li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className={styles.ol} start={node.attrs?.start && node.attrs.start !== 1 ? node.attrs.start : undefined}>
          {(node.content ?? []).map((li, i) => (
            <li key={`${key}-${i}`}>{(li.content ?? []).map((p, j) => renderInline(p.content, `${key}-${i}-${j}`))}</li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className={styles.quote}>
          {(node.content ?? []).map((p, i) => (
            <p key={`${key}-${i}`}>{renderInline(p.content, `${key}-${i}`)}</p>
          ))}
        </blockquote>
      );
    case 'image': {
      const src = safeHref(node.attrs.src ?? '');
      if (!src) return null;
      const alt = node.attrs.alt ?? '';
      const caption = node.attrs.caption?.trim();
      const { width, height } = node.attrs;
      // Explicit intrinsic size + `aspect-ratio` reserves the picture's box
      // before it loads, so the surrounding text doesn't shift once it does —
      // the same reason the cover image already carries fixed dimensions.
      // Only known for an image inserted after this existed; older rows fall
      // back to the previous fluid-width behaviour (`RichContent.module.css`'s
      // `.img` rule still sets `block-size: auto` for exactly that case).
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.img}
          src={src}
          alt={alt}
          // The FIRST body image is very often the LCP element on an article
          // that opens with a picture; lazy-loading it is a self-inflicted
          // delay against the LCP < 2.5s budget. Every later one stays lazy.
          loading={eagerImage ? 'eager' : 'lazy'}
          fetchPriority={eagerImage ? 'high' : undefined}
          decoding="async"
          {...(width && height
            ? { width, height, style: { aspectRatio: `${width} / ${height}` } }
            : {})}
        />
      );
      // A caption is visible text describing the picture; wrapping it in a
      // <figure>/<figcaption> is what associates the two for assistive tech
      // instead of leaving an orphan paragraph under an image.
      return caption ? (
        <figure key={key} className={styles.figure}>
          {img}
          <figcaption className={styles.caption}>{caption}</figcaption>
        </figure>
      ) : (
        <span key={key} className={styles.imgWrap}>
          {img}
        </span>
      );
    }
    case 'table':
      return renderTable(node, key);
    case 'chart':
      return <ArticleChart key={key} attrs={node.attrs} idBase={`chart-${index}`} />;
    case 'horizontalRule':
      return <hr key={key} className={styles.rule} />;
    case 'paragraph':
    default: {
      const content = (node as ParagraphNode).content;
      // ProseMirror keeps an empty trailing paragraph in almost every
      // document; rendering it as a blank <p> adds a gap the writer never
      // asked for.
      if (!content?.length) return null;
      return (
        <p key={key} className={styles.p}>
          {renderInline(content, key)}
        </p>
      );
    }
  }
}

export function RichContent({ doc, className }: { doc: RichDoc; className?: string }) {
  const blocks = doc.content ?? [];
  const firstImageIndex = blocks.findIndex((b) => b.type === 'image');
  return (
    <div className={className ? `${styles.prose} ${className}` : styles.prose}>
      {blocks.map((node, i) => renderBlock(node, i, i === firstImageIndex))}
    </div>
  );
}
