/**
 * Companion to seoAuditReport.ts: dumps full title/excerpt/body_md for a
 * given list of article ids (read from stdin as a JSON array), so the
 * failing-articles list can be fixed with full context instead of just the
 * summary numbers. Read-only.
 *
 *   cat ids.json | docker run --rm -i --network ahantime_default \
 *     -v /opt/ahantime:/app -w /app/web -e DATABASE_URL="postgres://…" \
 *     node:20 ./node_modules/.bin/tsx scripts/seoAuditFullDump.ts
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seo-audit-dump] DATABASE_URL is not set.');
  process.exit(1);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin();
  const ids: string[] = JSON.parse(raw);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const res = await client.query(
    `SELECT id, slug, type, title, excerpt, body_md FROM articles WHERE id = ANY($1::text[])`,
    [ids],
  );
  await client.end();

  console.log(JSON.stringify(res.rows));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
