/**
 * Legacy markdown → `RichDoc` (US-12.4).
 *
 * This is the ONLY reader of the old markdown dialect left in the app, and it
 * is the SAME code in all three places that need it:
 *
 *   1. `ArticleBody`, for a row whose `body_json` is still null (an article
 *      written before the structured editor shipped, or restored from a
 *      backup);
 *   2. `scripts/backfillArticleBodyJson.ts`, which converts those rows;
 *   3. `MarkdownProse`, the compatibility surface the existing tests drive.
 *
 * `blocksFromMarkdown` below is the parser that used to live inside
 * `components/content/ArticleBody.tsx`, moved rather than rewritten — its
 * quirks (a heading is only recognised as the first line of a blank-line
 * delimited chunk, a lone `![alt](url)` line is an image, GFM pipe tables) are
 * exactly what produced the bodies currently in the database, so reproducing
 * them is the point. Do not "improve" it: new articles never go through here.
 */
import type { Block } from '@/components/content/legacyBodies';
import {
  safeHref,
  type BlockNode,
  type InlineNode,
  type ParagraphNode,
  type RichDoc,
  type TextNode,
} from './richDoc';

/**
 * Inline markdown → text nodes with marks: `**bold**`, `*italic*`, `[a](b)`.
 *
 * Bold before italic: `**x**` must not be read as `*` + `*x*` + `*`. The
 * italic branch must also not fire on a `*` that follows another `*`. That
 * guard used to be a lookbehind, `(?<!\*)`; lookbehind is unsupported in
 * Safari before 16.4 and an unsupported group is a SYNTAX error, so the whole
 * chunk failed to parse and blanked every article page on those browsers
 * rather than degrading to unformatted text. It stays expressed as a captured
 * preceding character (empty at the start of the string), re-emitted as text
 * below so nothing is swallowed.
 */
export function parseInline(text: string): InlineNode[] {
  const re = /\*\*([^*]+)\*\*|(^|[^*])\*([^*]+)\*(?!\*)|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const out: InlineNode[] = [];
  const push = (t: string, node?: Omit<TextNode, 'type' | 'text'>) => {
    if (!t) return;
    out.push({ type: 'text', text: t, ...(node ?? {}) });
  };
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      push(m[1], { marks: [{ type: 'bold' }] });
    } else if (m[3] !== undefined) {
      if (m[2]) push(m[2]);
      push(m[3], { marks: [{ type: 'italic' }] });
    } else {
      const href = safeHref(m[5]!);
      // A rejected scheme still shows its label — dropping the text silently
      // would make the sentence read as if a word were missing.
      if (href) push(m[4]!, { marks: [{ type: 'link', attrs: { href } }] });
      else push(m[4]!);
    }
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last));
  // Merge runs that carry the same marks. The italic branch above deliberately
  // emits the character PRECEDING the run as its own node (it is only in the
  // match so it can be tested), which would otherwise leave «الف» split across
  // two text nodes — invisible on screen, but a different document, and a
  // different DOM once each node is rendered.
  const merged: InlineNode[] = [];
  for (const node of out) {
    const prev = merged[merged.length - 1];
    if (
      node.type === 'text' &&
      prev?.type === 'text' &&
      JSON.stringify(prev.marks ?? null) === JSON.stringify(node.marks ?? null)
    ) {
      merged[merged.length - 1] = { ...prev, text: prev.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/** Minimal markdown → blocks (paragraphs, ##/### headings, - lists, > quotes,
 *  GFM pipe tables, a standalone `![alt](url)` line). Moved verbatim from
 *  `ArticleBody.tsx`; see the module docstring. */
export function blocksFromMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const chunks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
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
    if (lines.length >= 2 && lines[0]!.includes('|') && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[1]!)) {
      const cells = (l: string) =>
        l
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      blocks.push({ kind: 'table', head: cells(lines[0]!), rows: lines.slice(2).map(cells) });
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

function para(text: string): ParagraphNode {
  return { type: 'paragraph', content: parseInline(text) };
}

/** One legacy block → one document node. */
export function blockToNode(b: Block): BlockNode {
  switch (b.kind) {
    case 'h2':
      return { type: 'heading', attrs: { level: 2 }, content: parseInline(b.text) };
    case 'h3':
      return { type: 'heading', attrs: { level: 3 }, content: parseInline(b.text) };
    case 'ul':
      return {
        type: 'bulletList',
        content: b.items.map((i) => ({ type: 'listItem', content: [para(i)] })),
      };
    case 'ol':
      return {
        type: 'orderedList',
        attrs: { start: 1 },
        content: b.items.map((i) => ({ type: 'listItem', content: [para(i)] })),
      };
    case 'quote':
      return { type: 'blockquote', content: [para(b.text)] };
    case 'img':
      // A markdown image has no caption and no way to say "decorative", so an
      // empty alt stays empty and un-flagged — which is what makes it show up
      // in the editor's «تصویر بدون متن جایگزین» warning after the migration,
      // exactly as it should.
      return { type: 'image', attrs: { src: b.src, alt: b.alt ?? '', caption: null } };
    case 'table':
      return {
        type: 'table',
        content: [
          { type: 'tableRow', content: b.head.map((h) => ({ type: 'tableHeader' as const, content: [para(h)] })) },
          ...b.rows.map((row) => ({
            type: 'tableRow' as const,
            content: row.map((c) => ({ type: 'tableCell' as const, content: [para(c)] })),
          })),
        ],
      };
    case 'p':
    default:
      return para(b.text);
  }
}

export function blocksToDoc(blocks: Block[]): RichDoc {
  return { type: 'doc', content: blocks.map(blockToNode) };
}

export function markdownToDoc(md: string): RichDoc {
  return blocksToDoc(blocksFromMarkdown(md ?? ''));
}
