/**
 * ChatMarkdown — a tiny, SAFE renderer for the markdown subset the advisor
 * (DeepSeek) actually emits: GFM tables, bullet/numbered lists, headings,
 * bold/italic, inline code and horizontal rules. Hand-rolled on purpose:
 *
 *  - Output is React elements only (never dangerouslySetInnerHTML) — the
 *    model's text can never inject markup, so XSS is impossible by
 *    construction; react-markdown + remark-gfm would add ~35 KB gz to the
 *    client bundle for a subset coverable in ~150 lines.
 *  - Latin digits are converted to Persian at render time (the whole site is
 *    Persian-digit; the server grounding validator normalizes digits itself,
 *    so display conversion never affects it).
 *  - Streaming-tolerant: unknown/partial syntax degrades to plain text —
 *    worst case the user briefly sees what the model wrote, never a crash.
 */
import { Fragment, type ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ChatMarkdown.module.css';

/* ---------------- inline: **bold** · *italic* · `code` ---------------- */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
/** Latin runs (grades/standards like ST37, A3, IPE14) inside Persian text —
 *  bidi-isolated so their digits/punctuation never reorder in the RTL line
 *  (W3C alreq: the classic «10-20 renders as 20-10» failure). */
const LATIN_RUN = /([A-Za-z][A-Za-z0-9\-./]*)/g;

function faText(s: string, keyBase: string): ReactNode[] {
  return s.split(LATIN_RUN).map((part, i) =>
    /^[A-Za-z]/.test(part) ? (
      <bdi key={`${keyBase}~${i}`}>{part}</bdi>
    ) : (
      <Fragment key={`${keyBase}~${i}`}>{toPersianDigits(part)}</Fragment>
    ),
  );
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}.${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={key}>{faText(part.slice(2, -2), key)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={key} className={styles.code}>
          {toPersianDigits(part.slice(1, -1))}
        </code>
      );
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={key}>{faText(part.slice(1, -1), key)}</em>;
    return <Fragment key={key}>{faText(part, key)}</Fragment>;
  });
}

/* ---------------- streaming repair ---------------- */

/**
 * Make an in-flight (still streaming) buffer safe to parse: close a dangling
 * `**`/`` ` `` so the tail doesn't flash as literal asterisks, and hold back a
 * trailing half-written table row until its line completes. Runs only on the
 * throwaway preview copy — the committed message is parsed verbatim.
 */
export function repairStreaming(text: string): string {
  let t = text;
  const lastNl = t.lastIndexOf('\n');
  const lastLine = t.slice(lastNl + 1);
  // A lone `|…` tail that isn't a finished row yet — defer it one tick.
  if (/^\s*\|/.test(lastLine) && !/\|\s*$/.test(lastLine)) t = t.slice(0, Math.max(lastNl, 0));
  if ((t.match(/\*\*/g)?.length ?? 0) % 2 === 1) t += '**';
  if ((t.match(/`/g)?.length ?? 0) % 2 === 1) t += '`';
  return t;
}

/* ---------------- block parsing ---------------- */

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'hr' };

const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*(?:\d+|[۰-۹]+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;
const HR = /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

function splitRow(line: string): string[] {
  const m = line.match(TABLE_ROW);
  return (m ? m[1]! : line).split('|').map((c) => c.trim());
}

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }

    // GFM table: header row + separator row (+ body rows).
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        // Pad ragged model rows to the header width so a short row renders
        // as an incomplete row instead of shifting every column.
        const cells = splitRow(lines[i]!);
        rows.push(header.map((_, c) => cells[c] ?? ''));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      blocks.push({ kind: 'h', text: h[1]! });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        quoteLines.push(lines[i]!.match(QUOTE)![1]!);
        i++;
      }
      blocks.push({ kind: 'quote', lines: quoteLines });
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i]!)) {
        items.push(lines[i]!.match(BULLET)![1]!);
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i]!)) {
        items.push(lines[i]!.match(ORDERED)![1]!);
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph: consecutive plain lines (each keeps its own line break).
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !TABLE_ROW.test(lines[i]!) &&
      !BULLET.test(lines[i]!) &&
      !ORDERED.test(lines[i]!) &&
      !HEADING.test(lines[i]!) &&
      !HR.test(lines[i]!) &&
      !QUOTE.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'p', lines: para });
  }

  return blocks;
}

/* ---------------- render ---------------- */

/** True when a cell is essentially numeric (price/weight/size) → tabular
 *  numerals + LTR-safe numeric run, matching the site's price tables. */
function isNumericCell(s: string): boolean {
  const stripped = s.replace(/[\s٬،,.٫‌*×xX-]|تومان|کیلوگرم|کیلو|گرم|تن|ریال|متر|شاخه|میلی‌متر/g, '');
  return stripped.length > 0 && /^[\d۰-۹٠-٩]+$/.test(stripped);
}

export function ChatMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseBlocks(streaming ? repairStreaming(text) : text);
  return (
    <div className={styles.md}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        switch (b.kind) {
          case 'h':
            // Every heading level renders as one compact strong row — a chat
            // bubble is not a document; h1-sized text inside it reads broken.
            return (
              <p key={key} className={styles.heading} role="heading" aria-level={4}>
                {renderInline(b.text, key)}
              </p>
            );
          case 'hr':
            return <hr key={key} className={styles.hr} />;
          case 'quote':
            return (
              <blockquote key={key} className={styles.quote}>
                {b.lines.map((ln, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(ln, `${key}.${li}`)}
                  </Fragment>
                ))}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} className={styles.list}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `${key}.${ii}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className={styles.list}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `${key}.${ii}`)}</li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <div key={key} className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {b.header.map((h, hi) => (
                        <th key={hi} scope="col">
                          {renderInline(h, `${key}.h${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className={isNumericCell(cell) ? 'tnum' : undefined}>
                            {renderInline(cell, `${key}.${ri}.${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'p':
            return (
              <p key={key}>
                {b.lines.map((ln, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(ln, `${key}.${li}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
