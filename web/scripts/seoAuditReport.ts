/**
 * Read-only report: every published article failing the on-page SEO checks
 * `seoStats()` (web/src/lib/server/repos/analyticsRepo.ts) already computes,
 * with the exact reason(s) and current values — so each one can be fixed by
 * hand with full context instead of guessing from the panel's summary
 * numbers alone. Mirrors `checkArticleSeo`/`stripMarkdownForWordCount`
 * exactly; if those functions ever change, update this alongside them.
 *
 * Read-only — no writes, no --apply flag needed.
 *
 *   docker run --rm -v /opt/ahantime:/app -w /app/web \
 *     -e DATABASE_URL="postgres://…" node:20 \
 *     ./node_modules/.bin/tsx scripts/seoAuditReport.ts
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seo-audit] DATABASE_URL is not set.');
  process.exit(1);
}

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

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const res = await client.query(
    `SELECT id, slug, title, type, excerpt, body_md FROM articles WHERE status = 'published' ORDER BY publish_at DESC`,
  );
  await client.end();

  const rows = res.rows as Array<{
    id: string;
    slug: string;
    title: string;
    type: string;
    excerpt: string | null;
    body_md: string;
  }>;

  let titleFail = 0;
  let excerptFail = 0;
  let thinFail = 0;
  const failing: Array<Record<string, unknown>> = [];

  for (const a of rows) {
    const stripped = stripMarkdownForWordCount(a.body_md).trim();
    const words = stripped ? stripped.split(/\s+/).length : 0;
    const titleLen = a.title.trim().length;
    const excerptLen = (a.excerpt ?? '').trim().length;
    const titleOk = titleLen >= 20 && titleLen <= 65;
    const excerptOk = excerptLen >= 70 && excerptLen <= 160;
    const thinOk = words >= 300;
    if (!titleOk) titleFail++;
    if (!excerptOk) excerptFail++;
    if (!thinOk) thinFail++;
    if (!titleOk || !excerptOk || !thinOk) {
      failing.push({
        id: a.id,
        slug: a.slug,
        type: a.type,
        title: a.title,
        titleLen,
        titleOk,
        excerpt: a.excerpt,
        excerptLen,
        excerptOk,
        words,
        thinOk,
      });
    }
  }

  console.log(`Total published: ${rows.length}`);
  console.log(`Title fail: ${titleFail}, Excerpt fail: ${excerptFail}, Thin (<300 words) fail: ${thinFail}`);
  console.log(`Total failing (any check): ${failing.length}`);
  console.log(JSON.stringify(failing, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
