/**
 * Minimal server-side CSV — no established convention existed in this repo
 * before (the only "export" precedent, ExportMenu.tsx, is a client-side
 * `.xls`-shaped Blob for the public price table, not a real server CSV).
 * Shared by every admin CSV-export route (audit, leads, ...) so the escaping/
 * BOM/header logic lives in exactly one place.
 */

/**
 * RFC 4180 field escaping: quote a field that contains a comma, quote, or
 * newline, doubling any embedded quotes.
 *
 * Also neutralizes CSV/formula injection (OWASP): a field is user-controlled
 * for at least one column of every current export (`contactName` on the
 * public lead form has no character restriction — see
 * `lib/validation/api.ts`). A value opening with `=`, `+`, `-`, `@`, tab, or
 * CR is evaluated as a formula by Excel/Sheets/LibreOffice on open — the
 * classic exfiltration/RCE-via-DDE vector — not something RFC 4180 quoting
 * guards against, since those characters aren't structural CSV syntax. A
 * leading apostrophe forces text interpretation in every mainstream
 * spreadsheet app without any other visible change to the cell.
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
