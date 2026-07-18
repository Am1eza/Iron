/**
 * Minimal server-side CSV — no established convention existed in this repo
 * before (the only "export" precedent, ExportMenu.tsx, is a client-side
 * `.xls`-shaped Blob for the public price table, not a real server CSV).
 * Shared by every admin CSV-export route (audit, leads, ...) so the escaping/
 * BOM/header logic lives in exactly one place.
 */

/** RFC 4180 field escaping: quote a field that contains a comma, quote, or
 *  newline, doubling any embedded quotes. */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the CSV text. A UTF-8 BOM is prepended — without it, Excel
 *  (the realistic consumer of a Persian-text export) misdetects the encoding
 *  and renders فارسی text as mojibake. CRLF line endings, matching RFC 4180. */
const UTF8_BOM = String.fromCharCode(0xfeff);

export function toCsv(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

/** Wraps `toCsv` in a downloadable `Response` — sets the content type and a
 *  `Content-Disposition: attachment` filename in one call. */
export function csvResponse(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): Response {
  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
