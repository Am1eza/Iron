/**
 * Applies body-content SEO fixes (thin-content, <300 words) to `articles`.
 *
 * Unlike title/excerpt, `body_md` is DERIVED from `body_json` on every
 * write through the real app (see the schema comment on `articles.bodyMd`)
 * — `body_json` is the actual source of truth the renderer prefers. A raw
 * `body_md`-only UPDATE would pass the SEO panel's word count (which reads
 * `body_md`) while the live page kept rendering the old, unfixed content
 * from the stale `body_json`. So this script uses the SAME conversion
 * functions the app itself uses (`markdownToDoc`/`docToMarkdown`, imported
 * directly, not reimplemented) to keep both columns in sync, exactly like
 * `backfillArticleBodyJson.ts` does for its own migration.
 *
 * Input on stdin: JSON array of {id, appendMarkdown} — `appendMarkdown` is
 * appended to the article's CURRENT body_md (fetched fresh from the DB,
 * not from a stale local copy), then the combined text is round-tripped
 * through markdownToDoc → docToMarkdown so body_md and body_json are both
 * regenerated from the identical source. Word count is re-verified against
 * the exact same stripping logic `checkArticleSeo` uses before writing —
 * a fix that doesn't actually clear 300 words is skipped, not shipped.
 *
 * Dry run by default; pass --apply to write.
 *
 *   cat fixes.json | docker run --rm -i --network ahantime_default \
 *     -v /opt/ahantime:/app -w /app/web -e DATABASE_URL="postgres://…" \
 *     node:20 ./node_modules/.bin/tsx scripts/seoBodyFixApply.ts [--apply]
 */
import pg from 'pg';
import { markdownToDoc } from '../src/lib/content/markdownToDoc';
import { docToMarkdown } from '../src/lib/content/docToMarkdown';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seo-body-fix] DATABASE_URL is not set.');
  process.exit(1);
}

interface Fix {
  id: string;
  appendMarkdown: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

// Exact copy of analyticsRepo.ts's stripMarkdownForWordCount — do not let
// this drift from the real one; it's what the panel's score is computed
// against.
function stripMarkdownForWordCount(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\|?-{2,}\|?[-|\s]*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
function wordCount(md: string): number {
  const s = stripMarkdownForWordCount(md).trim();
  return s ? s.split(/\s+/).length : 0;
}

async function main() {
  const fixes: Fix[] = JSON.parse(await readStdin());
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  let skipped = 0;
  for (const fix of fixes) {
    const cur = await client.query(`SELECT slug, body_md FROM articles WHERE id = $1`, [fix.id]);
    if (cur.rows.length === 0) {
      console.error(`[SKIP not found] ${fix.id}`);
      skipped++;
      continue;
    }
    const { slug, body_md: currentBodyMd } = cur.rows[0] as { slug: string; body_md: string };
    const combinedMd = `${currentBodyMd}${fix.appendMarkdown}`;

    // Round-trip through the SAME parser/serialiser the real editor uses,
    // so body_md and body_json are derived from the identical source —
    // never hand-write body_json.
    const doc = markdownToDoc(combinedMd);
    const finalMd = docToMarkdown(doc);
    const words = wordCount(finalMd);

    console.log(`\n${fix.id} (${slug})`);
    console.log(`  words: ${wordCount(currentBodyMd)} -> ${words}`);
    if (words < 300) {
      console.error(`  [SKIP still under 300 words after fix]`);
      skipped++;
      continue;
    }
    if (APPLY) {
      await client.query(
        `UPDATE articles SET body_md = $1, body_json = $2, updated_at = now() WHERE id = $3`,
        [finalMd, JSON.stringify(doc), fix.id],
      );
    }
  }
  await client.end();
  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${fixes.length - skipped}, skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
