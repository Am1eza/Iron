/**
 * `RichDoc` → the markdown dialect `blocksFromMarkdown` reads (US-12.4).
 *
 * `articles.body_md` is no longer what an editor types — it is DERIVED from
 * `body_json` on every write (see `articlesRepo.updateArticle`). It is kept,
 * rather than dropped, because four things already depend on the body being
 * plain searchable text and none of them should have to learn a tree format:
 *
 *   · `adminListArticles` — the content queue's "search the body" box
 *   · `searchPublishedGuides` — the AI advisor's `searchGuides` grounding,
 *     including its `articles_body_trgm_idx` GIN trigram index
 *   · `analyticsRepo.seoStats` — word-count-based SEO checks
 *   · disaster recovery — if `body_json` were ever lost, the markdown still
 *     renders through the legacy path with nothing but the chart styling gone.
 *
 * So this must stay a faithful projection: every word a reader sees has to
 * appear here, including the ones inside a chart.
 */
import type { BlockNode, ChartAttrs, InlineNode, ParagraphNode, RichDoc } from './richDoc';

/** Inline nodes → markdown. Marks are applied innermost-first so a bold link
 *  comes out as `[**x**](href)` rather than as two overlapping runs the
 *  reader can't parse. */
function inlineToMarkdown(nodes: InlineNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return ' ';
      let out = n.text ?? '';
      if (!out) return '';
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === 'bold')) out = `**${out}**`;
      if (marks.some((m) => m.type === 'italic')) out = `*${out}*`;
      const link = marks.find((m) => m.type === 'link');
      if (link && 'attrs' in link && link.attrs?.href) out = `[${out}](${link.attrs.href})`;
      return out;
    })
    .join('');
}

function paragraphsToText(nodes: ParagraphNode[] | undefined): string {
  return (nodes ?? [])
    .map((p) => inlineToMarkdown(p.content))
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** A `|` inside a cell would end the column early when the table is read back.
 *  There is no escape sequence in the dialect `blocksFromMarkdown` accepts, so
 *  the character is replaced with the full-width form: it looks the same to a
 *  reader and cannot re-split the row. */
function cellText(nodes: ParagraphNode[] | undefined): string {
  return paragraphsToText(nodes).replace(/\|/g, '｜').replace(/\n/g, ' ');
}

/** Same reasoning as `cellText` above — a chart label is writer-entered text
 *  that ends up as a markdown table cell in the `body_md` mirror, so a literal
 *  `|` in it would split that row exactly the same way. */
function chartCell(text: string): string {
  return text.replace(/\|/g, '｜');
}

function chartToMarkdown(attrs: ChartAttrs): string {
  const parts: string[] = [];
  const heading = attrs.title?.trim();
  if (heading) parts.push(attrs.unit?.trim() ? `${heading} (${attrs.unit.trim()})` : heading);
  const labels = attrs.labels ?? [];
  const series = attrs.series ?? [];
  if (labels.length && series.length) {
    const head = ['', ...series.map((s) => chartCell(s.label || '—'))];
    const rows = labels.map((label, i) => [
      chartCell(label || '—'),
      ...series.map((s) => {
        const v = s.values?.[i];
        return v === null || v === undefined ? '—' : String(v);
      }),
    ]);
    parts.push(
      [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${r.join(' | ')} |`),
      ].join('\n'),
    );
  }
  if (attrs.source?.trim()) parts.push(`منبع: ${attrs.source.trim()}`);
  return parts.filter(Boolean).join('\n\n');
}

function blockToMarkdown(node: BlockNode): string {
  switch (node.type) {
    case 'heading':
      return `${node.attrs.level === 3 ? '###' : '##'} ${inlineToMarkdown(node.content)}`.trim();
    case 'bulletList':
      return (node.content ?? [])
        .map((li) => `- ${paragraphsToText(li.content)}`)
        .filter((l) => l !== '- ')
        .join('\n');
    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${paragraphsToText(li.content)}`)
        .filter((l) => !/^\d+\. $/.test(l))
        .join('\n');
    case 'blockquote': {
      const text = paragraphsToText(node.content);
      return text ? `> ${text}` : '';
    }
    case 'image': {
      const alt = node.attrs.alt ?? '';
      const img = `![${alt}](${node.attrs.src})`;
      // The caption is real prose a reader sees, so it belongs in the mirror.
      // Its own chunk, not the same line: a two-line chunk starting with an
      // image is a paragraph to `blocksFromMarkdown`, not an image.
      return node.attrs.caption ? `${img}\n\n${node.attrs.caption}` : img;
    }
    case 'table': {
      const rows = (node.content ?? []).map((r) => (r.content ?? []).map((c) => cellText(c.content)));
      if (rows.length === 0) return '';
      const [head, ...body] = rows;
      const width = head!.length;
      return [
        `| ${head!.join(' | ')} |`,
        `| ${head!.map(() => '---').join(' | ')} |`,
        // Pad/trim so a merged cell can't produce a row narrower than the
        // header, which would read back as a table with holes.
        ...body.map((r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`),
      ].join('\n');
    }
    case 'chart':
      return chartToMarkdown(node.attrs);
    case 'horizontalRule':
      return '---';
    case 'paragraph':
    default:
      return inlineToMarkdown((node as ParagraphNode).content);
  }
}

export function docToMarkdown(doc: RichDoc | null | undefined): string {
  if (!doc?.content?.length) return '';
  return doc.content
    .map(blockToMarkdown)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** Body text with the markdown syntax removed — the shape the AI advisor's
 *  excerpt builder and the SEO word count actually want. Kept beside the
 *  serializer so the two can never disagree about what counts as content. */
export function docToPlainText(doc: RichDoc | null | undefined): string {
  return docToMarkdown(doc)
    .replace(/^[#>-]+\s*/gm, '')
    .replace(/\*\*|\*/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
