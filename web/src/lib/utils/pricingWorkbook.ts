export const PRICING_TEMPLATE_VERSION = '2';
export const PRICING_TEMPLATE_META_SHEET = '_ahantime_meta';

/** Defense in depth for spreadsheet exports opened by desktop Excel. */
export function safeSpreadsheetText(value: unknown): string {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
