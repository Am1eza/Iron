/**
 * Applies title/excerpt SEO fixes to `articles` — plain text columns, no
 * `body_json` involved (see `docs`/schema comment: `body_md` is what's
 * derived from `body_json`, not these two), so a direct column UPDATE is
 * safe and complete on its own, unlike a body edit.
 *
 * Input: JSON array of {id, field: 'title'|'excerpt', value} on stdin.
 * Dry run by default — prints before/after and length checks; pass --apply
 * to actually write. Re-validates the 20-65 / 70-160 char bounds itself
 * before writing, so a bad value in the input can't silently ship.
 *
 *   cat fixes.json | docker run --rm -i --network ahantime_default \
 *     -v /opt/ahantime:/app -w /app/web -e DATABASE_URL="postgres://…" \
 *     node:20 ./node_modules/.bin/tsx scripts/seoQuickFixApply.ts [--apply]
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seo-quick-fix] DATABASE_URL is not set.');
  process.exit(1);
}

interface Fix {
  id: string;
  field: 'title' | 'excerpt';
  value: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function inBounds(field: 'title' | 'excerpt', value: string): boolean {
  const len = value.trim().length;
  return field === 'title' ? len >= 20 && len <= 65 : len >= 70 && len <= 160;
}

async function main() {
  const fixes: Fix[] = JSON.parse(await readStdin());
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  let skipped = 0;
  for (const fix of fixes) {
    if (fix.field !== 'title' && fix.field !== 'excerpt') {
      console.error(`[SKIP bad field] ${fix.id} ${fix.field}`);
      skipped++;
      continue;
    }
    if (!inBounds(fix.field, fix.value)) {
      console.error(`[SKIP out-of-bounds] ${fix.id} ${fix.field} len=${fix.value.trim().length}`);
      skipped++;
      continue;
    }
    const cur = await client.query(`SELECT ${fix.field}, slug FROM articles WHERE id = $1`, [fix.id]);
    if (cur.rows.length === 0) {
      console.error(`[SKIP not found] ${fix.id}`);
      skipped++;
      continue;
    }
    console.log(`\n${fix.id} (${cur.rows[0].slug})`);
    console.log(`  ${fix.field} BEFORE: ${cur.rows[0][fix.field]}`);
    console.log(`  ${fix.field} AFTER:  ${fix.value}`);
    if (APPLY) {
      await client.query(`UPDATE articles SET ${fix.field} = $1, updated_at = now() WHERE id = $2`, [fix.value, fix.id]);
    }
  }
  await client.end();
  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${fixes.length - skipped}, skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
