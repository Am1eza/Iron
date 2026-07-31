/**
 * One-off: move the curated article prose out of the code and into the database.
 *
 * `ArticleBody.tsx` carried a `BODIES` map keyed by slug whose seven keys were
 * exactly the seven production articles, and the renderer preferred it over
 * `article.bodyMd`. So editing an article in the admin panel had no effect on
 * the public page — the preview showed the new text, the save reported success,
 * and the reader kept seeing hardcoded prose. The stored bodies were 87-113
 * character stubs reading "full text coming soon", which nobody ever saw.
 *
 * This serialises each Block[] back into the markdown dialect that
 * `blocksFromMarkdown` parses, so flipping the renderer to trust the database
 * is visually a no-op and editorially the whole fix.
 *
 * Emits SQL on stdout rather than writing directly — the statements are worth
 * reading before they run, and it needs no DB credentials:
 *
 *   npx tsx scripts/migrateArticleBodies.ts > /tmp/bodies.sql
 *   psql ... -f /tmp/bodies.sql
 *
 * Idempotent by construction: each UPDATE is guarded on the stored body still
 * being shorter than the curated one, so re-running never clobbers a real edit.
 */
import { BODIES, type Block } from '../src/components/content/legacyBodies';

/** Block[] -> the markdown dialect `blocksFromMarkdown` parses back. */
function toMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'ul':
          return b.items.map((i) => `- ${i}`).join('\n');
        case 'h3':
          return `### ${b.text}`;
        case 'ol':
          return b.items.map((i, n) => `${n + 1}. ${i}`).join('\n');
        case 'table':
          return [
            `| ${b.head.join(' | ')} |`,
            `| ${b.head.map(() => '---').join(' | ')} |`,
            ...b.rows.map((r) => `| ${r.join(' | ')} |`),
          ].join('\n');
        case 'quote':
          return `> ${b.text}`;
        case 'h2':
          return `## ${b.text}`;
        default:
          return b.text;
      }
    })
    .join('\n\n')
    .trim();
}

const lines: string[] = [
  '-- W25: move curated article bodies from ArticleBody.tsx into articles.body_md.',
  '-- Guarded on length so a real edit made through the panel is never overwritten.',
  'BEGIN;',
];

for (const [slug, blocks] of Object.entries(BODIES)) {
  const md = toMarkdown(blocks as Block[]);
  // Dollar-quoting avoids escaping the Persian prose, its quotes and newlines.
  const tag = '$body$';
  if (md.includes(tag)) throw new Error(`body for ${slug} contains the dollar-quote tag`);
  lines.push(
    '',
    `-- ${slug} (${md.length} chars)`,
    `UPDATE articles SET body_md = ${tag}${md}${tag}, updated_at = now()`,
    ` WHERE slug = '${slug}' AND length(btrim(body_md)) < ${md.length};`,
  );
}

lines.push('', 'COMMIT;');
console.log(lines.join('\n'));
