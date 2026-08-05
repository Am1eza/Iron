/**
 * The article body's structured format (US-12.4).
 *
 * WHY A DOCUMENT TREE AND NOT MARKDOWN
 * ------------------------------------
 * The body used to be a markdown string parsed by a ~250-line hand-rolled
 * regex reader. Every new capability (image captions, charts, a table that
 * isn't typed by hand as pipes) made that reader more fragile, and a writer
 * who mistyped one pipe silently got a paragraph instead of a table. The
 * editor is now WYSIWYG, so there is no reason for the storage format to be a
 * syntax a human has to get right: the body is stored as a validated document
 * tree instead, and `articles.body_md` is kept as a DERIVED markdown mirror so
 * full-text search, the AI advisor's `searchGuides` grounding and the SEO
 * word-count checks keep working unchanged (see `docToMarkdown`).
 *
 * The shape is ProseMirror/Tiptap's own JSON — the editor produces it
 * natively, so nothing is converted on the way in or out and there is no
 * lossy round trip to debug. It is NOT trusted on that account: everything
 * that reaches the database goes through `richDocSchema` first, which rejects
 * any node type, mark or attribute not listed here. The renderer
 * (`components/content/RichContent`) is a plain recursive function over these
 * types and imports nothing from Tiptap, so a public article page ships zero
 * bytes of editor runtime.
 */
import { z } from 'zod';

/* ------------------------------- limits -------------------------------- */

/** Series per chart. Three, because that is how many of the design system's
 *  categorical `--chart-*` hues stay separable under simulated colour-vision
 *  deficiency; a fourth would have to be a generated hue, which is exactly
 *  how charts become unreadable. A writer needing more adds a second chart. */
export const MAX_CHART_SERIES = 3;
/** Categories (x positions) per chart — an editorial chart, not a BI tool. */
export const MAX_CHART_POINTS = 36;
/** Serialised body ceiling, mirroring the 100 kB `bodyMd` cap the API already
 *  enforced. JSON is chattier than markdown, hence the larger number. */
export const MAX_DOC_BYTES = 400_000;

/* -------------------------------- types -------------------------------- */

export type LinkMark = { type: 'link'; attrs: { href: string } };
export type Mark = { type: 'bold' } | { type: 'italic' } | LinkMark;

export type TextNode = { type: 'text'; text: string; marks?: Mark[] };
export type HardBreakNode = { type: 'hardBreak' };
export type InlineNode = TextNode | HardBreakNode;

export type ParagraphNode = { type: 'paragraph'; content?: InlineNode[] };
export type HeadingNode = { type: 'heading'; attrs: { level: 2 | 3 }; content?: InlineNode[] };
export type ListItemNode = { type: 'listItem'; content?: ParagraphNode[] };
export type BulletListNode = { type: 'bulletList'; content?: ListItemNode[] };
export type OrderedListNode = { type: 'orderedList'; attrs?: { start?: number }; content?: ListItemNode[] };
export type BlockquoteNode = { type: 'blockquote'; content?: ParagraphNode[] };

export type ImageNode = {
  type: 'image';
  attrs: {
    src: string;
    /** Always a string. `''` means "deliberately decorative" — see `decorative`. */
    alt: string;
    /** Optional visible caption below the picture (rendered in a <figcaption>). */
    caption?: string | null;
    /** The writer explicitly ticked «تصویر تزئینی است». Without this flag an
     *  empty alt is indistinguishable from an alt nobody got around to
     *  writing, which is the state the old editor left EVERY image in. */
    decorative?: boolean;
    /** Natural pixel dimensions, captured client-side right after upload.
     *  Only used to reserve the image's box on the public page (an explicit
     *  `width`/`height` + CSS `aspect-ratio`) so it can't shift the text
     *  around it while it loads — a real layout-shift regression this
     *  capability didn't have before (cover images already do this). Missing
     *  on any image inserted before this existed; the renderer falls back to
     *  the old fluid-width behaviour when absent. */
    width?: number | null;
    height?: number | null;
  };
};

export type TableCellNode = {
  type: 'tableCell' | 'tableHeader';
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] | null };
  content?: ParagraphNode[];
};
export type TableRowNode = { type: 'tableRow'; content?: TableCellNode[] };
export type TableNode = { type: 'table'; content?: TableRowNode[] };

export type ChartKind = 'bar' | 'line';
export type ChartSeries = { label: string; values: (number | null)[] };
export type ChartAttrs = {
  kind: ChartKind;
  title: string;
  /** Unit shown on the value axis and in the data table, e.g. «تومان». */
  unit: string;
  /** Category labels — one per column/point. */
  labels: string[];
  series: ChartSeries[];
  /** «منبع: …» line under the chart. Optional but strongly encouraged. */
  source?: string;
};
export type ChartNode = { type: 'chart'; attrs: ChartAttrs };

export type HorizontalRuleNode = { type: 'horizontalRule' };

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | ImageNode
  | TableNode
  | ChartNode
  | HorizontalRuleNode;

export type RichDoc = { type: 'doc'; content?: BlockNode[] };

/* ------------------------------- helpers ------------------------------- */

/**
 * Only schemes that can't execute. Kept here (moved from ArticleBody) because
 * BOTH the renderer and the write-side validator need exactly one answer to
 * "is this href safe" — two copies is how one of them drifts.
 *
 * React 19 does neutralise `javascript:` at the DOM layer, but relying on a
 * framework internal as the only control is the wrong posture for a field an
 * editor (and, in future, a generated draft) fills in.
 */
export function safeHref(url: string): string | null {
  const v = url.trim();
  // A LEADING `//` is scheme-relative — the browser resolves it against
  // whatever protocol the page loaded over, i.e. it IS an external URL. The
  // single-slash alternative below must not also match it, or an editor could
  // enter `//evil.example/x` and have it treated as an internal path: no
  // `nofollow`/`noreferrer`, and `isExternal` (below) would not catch it
  // either since it only tests for `http(s)://`.
  if (/^\/\//.test(v)) return null;
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v) ? v : null;
}

/** External links get noreferrer + nofollow; internal ones stay clean. */
export function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Image sources. Uploads are stored as the same-origin `/uploads/…` path the
 * upload endpoint returns — `ImageUpload` hands out an absolute URL because
 * `coverUrl`/`ogImage` need one, so an absolute same-shape URL is folded back
 * to its path here rather than being rejected. A remote https URL is still
 * accepted (the CSP's `img-src 'self'` is what actually stops it rendering),
 * because silently dropping a picture out of a saved article is worse than
 * storing one that will visibly fail to load.
 */
export function normalizeImageSrc(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  // Same scheme-relative gap as `safeHref` above — `new URL('//evil.example/x')`
  // throws with no base, which used to fall into the site-relative branch below
  // and pass `startsWith('/')`.
  if (v.startsWith('//')) return null;
  if (v.startsWith('/uploads/')) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.pathname.startsWith('/uploads/') ? u.pathname : v;
    }
    return null;
  } catch {
    // Not absolute — a site-relative path is fine, anything else is not.
    return v.startsWith('/') ? v : null;
  }
}

/* ------------------------------ validation ----------------------------- */

const linkHref = z
  .string()
  .trim()
  .max(500)
  .transform((v, ctx) => {
    const href = safeHref(v);
    if (href) return href;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'نشانی پیوند معتبر نیست.' });
    return z.NEVER;
  });

const markSchema: z.ZodType<Mark> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href: linkHref }) }),
]) as z.ZodType<Mark>;

const textSchema: z.ZodType<TextNode> = z.object({
  type: z.literal('text'),
  text: z.string().max(20_000),
  marks: z.array(markSchema).max(4).optional(),
});

const inlineSchema: z.ZodType<InlineNode> = z.union([
  textSchema,
  z.object({ type: z.literal('hardBreak') }),
]) as z.ZodType<InlineNode>;

const paragraphSchema: z.ZodType<ParagraphNode> = z.object({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).max(500).optional(),
});

const headingSchema: z.ZodType<HeadingNode> = z.object({
  type: z.literal('heading'),
  // h1 is the article title, rendered by the page. A body heading is h2 or h3
  // so the document outline can never skip or duplicate a level.
  attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
  content: z.array(inlineSchema).max(500).optional(),
});

const listItemSchema: z.ZodType<ListItemNode> = z.object({
  type: z.literal('listItem'),
  content: z.array(paragraphSchema).max(20).optional(),
});

const imageSchema: z.ZodType<ImageNode> = z.object({
  type: z.literal('image'),
  attrs: z.object({
    src: z
      .string()
      .max(500)
      .transform((v, ctx) => {
        const src = normalizeImageSrc(v);
        if (src) return src;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'نشانی تصویر معتبر نیست.' });
        return z.NEVER;
      }),
    // Nullable in, always a string out: a `null` alt and a missing alt both
    // render as alt="" and there is no reason for the renderer to know which.
    alt: z
      .string()
      .max(300)
      .nullish()
      .transform((v) => (v ?? '').trim()),
    caption: z
      .string()
      .max(300)
      .nullish()
      .transform((v) => (v ?? '').trim() || null),
    decorative: z.boolean().optional(),
    // Bounded well above any real image (site uploads cap at 5 MB, not
    // realistically tens of thousands of pixels wide) — just enough to reject
    // a nonsensical value rather than trust it blindly.
    width: z.number().int().positive().max(20_000).nullish(),
    height: z.number().int().positive().max(20_000).nullish(),
  }),
}) as z.ZodType<ImageNode>;

const tableCellSchema: z.ZodType<TableCellNode> = z.object({
  type: z.union([z.literal('tableCell'), z.literal('tableHeader')]),
  attrs: z
    .object({
      colspan: z.number().int().min(1).max(20).optional(),
      rowspan: z.number().int().min(1).max(50).optional(),
      colwidth: z.array(z.number().int().min(1).max(2000)).max(20).nullish(),
    })
    .partial()
    .optional(),
  content: z.array(paragraphSchema).max(10).optional(),
}) as z.ZodType<TableCellNode>;

/** Exported so the chart node's `parseHTML` (a paste of a `data-chart` div
 *  copied from elsewhere in the editor, or crafted by hand) can validate
 *  BEFORE the attrs ever reach a React render — the per-block fallback in
 *  `sanitizeDoc` below only runs on the next `onUpdate`, which is too late to
 *  stop the node view rendering a malformed shape once. */
export const chartAttrsSchema = z
  .object({
    kind: z.enum(['bar', 'line']),
    title: z.string().max(160).nullish().transform((v) => (v ?? '').trim()),
    unit: z.string().max(40).nullish().transform((v) => (v ?? '').trim()),
    labels: z.array(z.string().max(60).transform((v) => v.trim())).max(MAX_CHART_POINTS),
    series: z
      .array(
        z.object({
          label: z.string().max(60).nullish().transform((v) => (v ?? '').trim()),
          // `null` is a real value here: it means "no figure for this month",
          // which a line chart must draw as a gap rather than as zero.
          values: z
            .array(z.union([z.number().finite(), z.null()]))
            .max(MAX_CHART_POINTS),
        }),
      )
      .max(MAX_CHART_SERIES),
    source: z.string().max(200).nullish().transform((v) => (v ?? '').trim() || undefined),
  })
  // Ragged input (a series shorter than `labels`) is padded rather than
  // rejected: the editor's data grid can legitimately be mid-edit when the
  // writer hits save, and losing the chart over it would be absurd.
  .transform((a) => ({
    ...a,
    series: a.series.map((s) => ({
      ...s,
      values: Array.from({ length: a.labels.length }, (_, i) => s.values[i] ?? null),
    })),
  }));

const blockSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([
    paragraphSchema,
    headingSchema,
    z.object({
      type: z.literal('bulletList'),
      content: z.array(listItemSchema).max(200).optional(),
    }),
    z.object({
      type: z.literal('orderedList'),
      attrs: z.object({ start: z.number().int().min(1).max(9999).optional() }).partial().optional(),
      content: z.array(listItemSchema).max(200).optional(),
    }),
    z.object({
      type: z.literal('blockquote'),
      content: z.array(paragraphSchema).max(20).optional(),
    }),
    imageSchema,
    z.object({
      type: z.literal('table'),
      content: z
        .array(z.object({ type: z.literal('tableRow'), content: z.array(tableCellSchema).max(20).optional() }))
        .max(200)
        .optional(),
    }),
    z.object({ type: z.literal('chart'), attrs: chartAttrsSchema }),
    z.object({ type: z.literal('horizontalRule') }),
  ]),
) as z.ZodType<BlockNode>;

/** The write-side gate. Anything not described above is a 400, not a silent
 *  pass-through — the renderer's `default:` branch is a safety net, not a
 *  policy. */
export const richDocSchema: z.ZodType<RichDoc> = z
  .object({
    type: z.literal('doc'),
    content: z.array(blockSchema).max(2000).optional(),
  })
  .superRefine((doc, ctx) => {
    if (JSON.stringify(doc).length > MAX_DOC_BYTES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'متن مقاله بیش از حد بلند است.' });
    }
  }) as z.ZodType<RichDoc>;

export const EMPTY_DOC: RichDoc = { type: 'doc', content: [] };

/**
 * Editor JSON → exactly what the server will store.
 *
 * The editor's own document carries attributes this schema does not keep — a
 * link's `target`/`rel`/`class`, an image's `title`, ProseMirror's default
 * `attrs` on nodes that declare them — and `z.object` strips them. Running the
 * SAME schema on the client before sending means the panel's "unsaved
 * changes" comparison is made between two documents of the identical shape;
 * without it, saving and re-reading an article marked itself dirty on arrival
 * every single time, because the round trip legitimately changed the JSON.
 *
 * Blocks are validated one at a time so a single malformed node (a paste from
 * an unexpected source, a future extension someone enables without updating
 * the schema) costs that block and not the article. The caller gets the count
 * so it can say so out loud rather than silently dropping a writer's work.
 */
export function sanitizeDoc(input: unknown): { doc: RichDoc; dropped: number } {
  const whole = richDocSchema.safeParse(input);
  if (whole.success) return { doc: whole.data, dropped: 0 };

  const raw = (input ?? {}) as { content?: unknown };
  const blocks = Array.isArray(raw.content) ? raw.content : [];
  const kept: BlockNode[] = [];
  let dropped = 0;
  for (const block of blocks) {
    const one = blockSchema.safeParse(block);
    if (one.success) kept.push(one.data);
    else dropped += 1;
  }
  return { doc: { type: 'doc', content: kept }, dropped };
}

/**
 * A key-order-independent fingerprint of a document.
 *
 * `JSON.stringify` is not usable for "has the body changed?": the column is
 * `jsonb`, and Postgres stores jsonb object keys in ITS own order (length,
 * then bytewise), not the order they were inserted in. So a document saved and
 * read straight back is character-for-character different from the one that
 * was sent, and a naive string compare reported every freshly-saved article as
 * having unsaved changes.
 */
export function docFingerprint(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) {
        // `undefined` and an absent key are the same thing to the database;
        // keeping one and dropping the other would be a phantom change.
        if (src[key] !== undefined) out[key] = walk(src[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** Images with neither a description nor a deliberate «decorative» mark — the
 *  state the OLD editor left every single image in. Surfaced in the drawer so
 *  it is visible before publishing, not after an SEO audit. */
export function countImagesMissingAlt(doc: RichDoc | null | undefined): number {
  let n = 0;
  for (const block of doc?.content ?? []) {
    if (block.type === 'image' && !block.attrs.decorative && !(block.attrs.alt ?? '').trim()) n += 1;
  }
  return n;
}

/** True when the document has nothing a reader would see. Used to decide
 *  whether to fall back to the legacy markdown body. */
export function isEmptyDoc(doc: RichDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true;
  return doc.content.every(
    (b) => b.type === 'paragraph' && (!b.content || b.content.length === 0),
  );
}
