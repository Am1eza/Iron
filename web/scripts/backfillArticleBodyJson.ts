/**
 * One-off backfill: `articles.body_md` → `articles.body_json` (US-12.4).
 *
 * The structured editor stores a document tree; every row written before it
 * shipped has `body_json = NULL` and renders by parsing `body_md` at request
 * time (see `components/content/ArticleBody`). That fallback is permanent and
 * correct, so this script is an OPTIMISATION AND A MIGRATION OF INTENT, not a
 * prerequisite — nothing breaks if it never runs. What it buys is that opening
 * an old article in the new editor starts from a real document instead of a
 * re-parse, so the first save can't quietly reformat anything.
 *
 * It reuses `markdownToDoc`, which is the SAME parser the renderer uses, so a
 * converted row is by construction identical on screen to an unconverted one.
 * That is verified rather than asserted: for every row it re-serialises the
 * document back to markdown with `docToMarkdown` and reports any row whose
 * round trip differs from the stored text, so a lossy conversion is visible
 * BEFORE anything is written.
 *
 * Safety:
 *   · dry run by default — pass `--apply` to write
 *   · only ever touches rows where `body_json IS NULL`, so it is idempotent
 *     and can never overwrite something written through the editor
 *   · does NOT touch `body_md`, `updated_at`, or any other column, so it
 *     cannot reorder the content queue or invalidate a cache
 *
 *   docker run --rm -v /opt/ahantime:/app -w /app/web \
 *     -e DATABASE_URL="postgres://…" node:20 \
 *     ./node_modules/.bin/tsx scripts/backfillArticleBodyJson.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { markdownToDoc } from '../src/lib/content/markdownToDoc';
import { docToMarkdown } from '../src/lib/content/docToMarkdown';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[backfill] DATABASE_URL is not set.');
  process.exit(1);
}

/** Whitespace-insensitive comparison: the serializer normalises a chunk's
 *  internal line breaks (the parser joins them into one paragraph anyway), so
 *  a difference in blank-line runs is not a content difference. */
function normalized(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) =>
      chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = { id: string; slug: string; status: string; body_md: string };

const { rows } = await pool.query<Row>(
  `SELECT id, slug, status, body_md FROM articles WHERE body_json IS NULL ORDER BY slug`,
);

console.log(`[backfill] ${rows.length} article(s) with no structured body.\n`);

let lossy = 0;
let empty = 0;
const updates: Array<{ id: string; slug: string; doc: unknown }> = [];

for (const row of rows) {
  const md = row.body_md ?? '';
  if (!md.trim()) {
    empty += 1;
    console.log(`  · ${row.slug} — empty body, skipped`);
    continue;
  }
  const doc = markdownToDoc(md);
  const back = docToMarkdown(doc);
  const same = normalized(back) === normalized(md);
  if (!same) {
    lossy += 1;
    console.log(`  ! ${row.slug} (${row.status}) — ROUND TRIP DIFFERS`);
    const a = normalized(md).split('\n');
    const b = normalized(back).split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) {
        console.log(`      line ${i + 1}\n        stored: ${JSON.stringify(a[i] ?? null)}\n        rebuilt: ${JSON.stringify(b[i] ?? null)}`);
      }
    }
  } else {
    const blocks = (doc.content ?? []).length;
    console.log(`  ✓ ${row.slug} (${row.status}) — ${blocks} block(s), round trip identical`);
  }
  updates.push({ id: row.id, slug: row.slug, doc });
}

console.log(
  `\n[backfill] ${updates.length} convertible · ${empty} empty · ${lossy} with a round-trip difference.`,
);

if (!APPLY) {
  console.log('[backfill] DRY RUN — nothing written. Re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const u of updates) {
    // The `body_json IS NULL` guard is repeated in the UPDATE, not just in the
    // SELECT above: between the two an editor may have saved a real document
    // through the panel, and clobbering that with a re-parse of the markdown
    // it just replaced would be the one genuinely destructive thing this
    // script could do. `updated_at` is deliberately left alone.
    const res = await client.query(
      `UPDATE articles SET body_json = $1::jsonb WHERE id = $2 AND body_json IS NULL`,
      [JSON.stringify(u.doc), u.id],
    );
    console.log(`  ${res.rowCount ? 'updated' : 'skipped (already structured)'}: ${u.slug}`);
  }
  await client.query('COMMIT');
  console.log('\n[backfill] committed.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('[backfill] rolled back:', err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
