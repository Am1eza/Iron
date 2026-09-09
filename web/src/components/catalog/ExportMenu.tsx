'use client';
import { useTranslations } from 'next-intl';
import { useToast } from '@/lib/hooks/useToast';
import {
  formatToman,
  formatMovement,
  priceHiddenLabel,
  toPersianDigits,
  withVat,
} from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import {
  sizeLabel,
  weightLabel,
  usesDimensions,
  dimensionsLabel,
  REGION_LABEL,
} from '@/lib/utils/catalogLabels';
import { CONSTANTS } from '@/lib/config/constants';
import type { PriceRow, Category } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { getLocalizedSkuName } from '@/lib/utils/localizedNames';
import { useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/config';
import { SheetIcon, PrintIcon, ImageIcon } from '@/components/primitives/icons';
import styles from './ExportMenu.module.css';

/** Column/cell text that isn't sourced from `catalogLabels` (out of scope —
 *  see that module's own header). Defaults to the original fa strings so
 *  every existing `cols()`/`rowCells()` call (including the unit tests, which
 *  call them with no locale awareness at all) keeps working unchanged; the
 *  component below passes real translations in. */
type ExportLabels = { product: string; unknown: string; factory: string; price: string; movement: string; deliveryTime: string };
const DEFAULT_LABELS: ExportLabels = {
  product: 'محصول',
  unknown: 'نامشخص',
  factory: 'کارخانه',
  price: 'قیمت (تومان)',
  movement: 'نوسان',
  deliveryTime: 'زمان تحویل',
};

/** The xls and print outputs are built by string-concatenating into HTML, and
 *  every value in them (product name, factory, category) is admin-entered DB
 *  content. Escaping keeps a stray `<` in a product name from silently eating
 *  the rest of a customer's spreadsheet row. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * E5 · Table exports — Excel (CSV, UTF-8 BOM so Excel reads Persian), Print (a
 * clean branded sheet), and Image-with-logo (PNG via canvas). All client-side,
 * no dependency. The branded header carries «آهن‌تایم» + the date.
 */
export const cols = (
  categorySlug?: string,
  subCategorySlug: string | null = null,
  regionColumn = false,
  labels: ExportLabels = DEFAULT_LABELS,
) => [
  labels.product,
  // ورق is measured by thickness, not size — same rule the on-screen table
  // follows (see catalogLabels), so an exported file matches what the buyer
  // was looking at when they clicked «اکسل».
  sizeLabel(categorySlug, subCategorySlug),
  // The same shared secondary-spec column as the screen: «ابعاد» for ورق,
  // «ضخامت» for the source-verified section subs, and absent on mixed or
  // unrelated product lines.
  ...(usesDimensions(categorySlug, subCategorySlug)
    ? [dimensionsLabel(categorySlug, subCategorySlug)]
    : []),
  // Same column, different question, on the پروفیل sub-categories whose mill
  // names are withheld: they publish a producing city instead (see
  // catalogLabels.regionFromFactory), and a file headed «کارخانه» with
  // «نامشخص» in every row of it would drop the one fact the on-screen table
  // groups by. A SUBSTITUTION, never an extra column — the image export lays
  // its columns out on a fixed pixel grid.
  regionColumn ? REGION_LABEL : labels.factory,
  `${weightLabel(categorySlug)} (kg)`,
  labels.price,
  labels.movement,
  labels.deliveryTime,
];

/** `withDimensions` MUST be the same flag `cols()` was built with — the cells
 *  are positional, so a mismatch would shift every column after the size.
 *
 *  `vat` mirrors the «با ارزش‌افزوده» toggle the buyer had switched on when they
 *  clicked export. It used to be ignored entirely: the file always carried the
 *  bare price, so a buyer looking at VAT-inclusive numbers on screen downloaded
 *  different ones. The column header is deliberately NOT relabelled — the image
 *  export lays its columns out on a fixed pixel grid — so the VAT state is
 *  spelled out in the sheet's subtitle line instead (see `vatNote`). */
export function rowCells(
  r: PriceRow,
  withDimensions = false,
  vat = false,
  vatRate: number = CONSTANTS.VAT_RATE,
  labels: ExportLabels = DEFAULT_LABELS,
  /** Locale-aware product name (i18n audit follow-up) — defaults to the raw
   *  fa `row.name` so every existing call (including the unit tests) is
   *  unaffected; the component below supplies `getLocalizedSkuName`. */
  resolveName: (row: PriceRow) => string = (row) => row.name,
): string[] {
  // `factory ?? region` and not a second flag: the two are alternatives on any
  // one row (catalogRepo.toPriceRow publishes exactly one of them), so this
  // cell cannot disagree with the header `cols()` chose for it.
  return [
    resolveName(r),
    r.size ? toPersianDigits(r.size) : labels.unknown,
    ...(withDimensions ? [r.dimensions ? toPersianDigits(r.dimensions) : labels.unknown] : []),
    r.factory ?? r.region ?? labels.unknown,
    r.theoreticalWeightKg ? toPersianDigits(String(r.theoreticalWeightKg)) : labels.unknown,
    priceHiddenLabel(r.current) ?? formatToman(withVat(r.current.price, vat, vatRate), false),
    formatMovement(r.current.movementPct),
    r.current.deliveryTime,
  ];
}

export function ExportMenu({
  rows,
  title,
  categorySlug,
  subCategorySlug = null,
  category,
  subs,
  vat = false,
  vatRate = CONSTANTS.VAT_RATE,
  compact = false,
  scopeLabel,
}: {
  rows: PriceRow[];
  title: string;
  /** Category the exported table belongs to — labels the size column only. */
  categorySlug?: string;
  /** Active sub-category, needed because only source-verified section subs
   *  expose the shared column as «ضخامت». Null means the mixed view. */
  subCategorySlug?: string | null;
  /** For `getLocalizedSkuName` (i18n audit follow-up) — the exported product
   *  name defaults to the raw fa `row.name` when either is absent. */
  category?: Category;
  subs?: SubCat[];
  /** Whether the buyer is currently viewing VAT-inclusive prices. The export
   *  follows the screen; see `rowCells`. */
  vat?: boolean;
  vatRate?: number;
  /** Secondary presentation for the per-factory instances inside each
   *  accordion section, so they don't compete with the page-wide toolbar. */
  compact?: boolean;
  /** Distinguishes the accessible name when several menus share a page — a
   *  screen-reader user tabbing a rebar page otherwise hears «خروجی جدول» nine
   *  times with nothing to tell the factories apart. */
  scopeLabel?: string;
}) {
  const toast = useToast();
  const t = useTranslations('exportMenu');
  const tPriceTable = useTranslations('priceTable');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  const today = formatJalali(new Date());
  const showDimensions = usesDimensions(categorySlug, subCategorySlug);
  const regionColumn = !rows.some((r) => r.factory) && rows.some((r) => r.region);
  const labels: ExportLabels = {
    product: t('colProduct'),
    unknown: tPriceTable('unknown'),
    factory: t('colFactory'),
    price: t('colPrice'),
    movement: t('colMovement'),
    deliveryTime: tCommon('data.delivery'),
  };
  const COLS = cols(categorySlug, subCategorySlug, regionColumn, labels);
  const resolveName = (r: PriceRow) =>
    getLocalizedSkuName(r, category, subs?.find((s) => s.slug === r.subCategoryId), locale);
  const cells = (r: PriceRow) => rowCells(r, showDimensions, vat, vatRate, labels, resolveName);
  // Spelled out on the sheet itself so a downloaded file is unambiguous about
  // which of the two numbers it carries once it leaves the browser.
  const vatNote = vat ? t('vatNoteSuffix') : '';

  // Branded spreadsheet — a styled HTML table saved as .xls (Excel opens it with
  // the branding + RTL intact). Header carries «آهن‌تایم» + the date; green header
  // row, zebra rows. No dependency; for a true .xlsx with an embedded raster logo,
  // swap in exceljs later.
  const exportXls = () => {
    const head = `<tr>${COLS.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = rows
      .map(
        (r, i) =>
          `<tr class="${i % 2 ? 'even' : ''}">${cells(r)
            .map((c) => `<td>${esc(c)}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    const cols = COLS.length;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(tPriceTable('priceFor', { name: title }))}</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        table{border-collapse:collapse;font-family:Tahoma,'B Nazanin',sans-serif;}
        .brand{font-size:20px;font-weight:800;color:#171C22;}
        .brand .a{color:#0A7F77;}
        .meta{color:#64707E;font-size:12px;}
        .foot{color:#97A2B0;font-size:11px;}
        th{background:#0A7F77;color:#FFFFFF;font-weight:700;border:1px solid #04635D;padding:8px 10px;text-align:right;}
        td{border:1px solid #E5E9F0;padding:6px 10px;text-align:right;font-size:12px;color:#171C22;mso-number-format:'\\@';}
        tr.even td{background:#F4F7FA;}
      </style></head><body>
      <table dir="rtl" border="0">
        <tr><td colspan="${cols}" style="border:none;padding:6px 0 0;"><span class="brand">آهن‌<span class="a">تایم</span></span></td></tr>
        <tr><td colspan="${cols}" style="border:none;padding:2px 0 12px;"><span class="meta">${esc(t('todayPriceLine', { title, date: today }))}${esc(vatNote)}</span></td></tr>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
        <tr><td colspan="${cols}" style="border:none;padding-top:12px;"><span class="foot">ahantime.com · ${esc(tCommon('tagline'))}</span></td></tr>
      </table>
    </body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ahantime-${title}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('xlsDownloaded'));
  };

  const print = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      toast.error(t('printBlocked'));
      return;
    }
    const head = `<tr>${COLS.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = rows
      .map((r) => `<tr>${cells(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('');
    const printDir = locale === 'en' || locale === 'zh' ? 'ltr' : 'rtl';
    win.document.write(`<!doctype html><html dir="${printDir}" lang="${locale}"><head><meta charset="utf-8"><title>${esc(t('pageTitle', { title, brand: tCommon('brand') }))}</title>
      <style>
        body{font-family:Tahoma,sans-serif;color:#171C22;padding:24px;}
        .bar{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #171C22;padding-bottom:12px;margin-bottom:16px;}
        .brand{font-size:22px;font-weight:800;} .brand span{color:#0A7F77;}
        .meta{color:#64707E;font-size:13px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th,td{border:1px solid #E5E9F0;padding:8px 10px;text-align:right;}
        th{background:#F4F7FA;} tr:nth-child(even) td{background:#FAFBFD;}
        .foot{margin-top:16px;color:#97A2B0;font-size:12px;text-align:center;}
      </style></head><body>
      <div class="bar"><div class="brand">آهن‌<span>تایم</span></div><div class="meta">${esc(t('todayPriceLine', { title, date: today }))}${esc(vatNote)}</div></div>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>
      <div class="foot">ahantime.com · ${esc(tCommon('tagline'))}</div>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const exportImage = async () => {
    const padX = 28;
    const rowH = 38;
    const headerH = 110;
    const footerH = 44;
    // One width per entry of `COLS`, in the same order — the «ابعاد» column is
    // only present for ورق, and a missing width here would silently stack
    // every later column on top of the previous one.
    const colW = showDimensions
      ? [260, 80, 120, 140, 120, 150, 110, 130]
      : [260, 80, 140, 120, 150, 110, 130];
    const width = colW.reduce((a, b) => a + b, 0) + padX * 2;
    const visible = rows.slice(0, 24);
    const height = headerH + (visible.length + 1) * rowH + footerH;
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // bg
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    // header
    ctx.fillStyle = '#171C22';
    ctx.font = '800 26px Tahoma';
    ctx.fillText('آهن‌تایم', width - padX, 40);
    ctx.fillStyle = '#0A7F77';
    ctx.fillRect(width - padX - 150, 56, 150, 3);
    ctx.fillStyle = '#64707E';
    ctx.font = '14px Tahoma';
    ctx.fillText(`${t('todayPriceLine', { title, date: today })}${vatNote}`, width - padX, 78);

    // column header
    let yy = headerH;
    ctx.fillStyle = '#F4F7FA';
    ctx.fillRect(padX, yy, width - padX * 2, rowH);
    ctx.fillStyle = '#64707E';
    ctx.font = '700 13px Tahoma';
    let cx = width - padX - 10;
    COLS.forEach((c, i) => {
      ctx.fillText(c, cx, yy + rowH / 2);
      cx -= colW[i]!;
    });

    // rows
    visible.forEach((r, ri) => {
      yy += rowH;
      if (ri % 2) {
        ctx.fillStyle = '#FAFBFD';
        ctx.fillRect(padX, yy, width - padX * 2, rowH);
      }
      ctx.fillStyle = '#2B333D';
      ctx.font = '13px Tahoma';
      let x2 = width - padX - 10;
      cells(r).forEach((cell, i) => {
        ctx.fillText(cell, x2, yy + rowH / 2);
        x2 -= colW[i]!;
      });
    });

    // footer
    ctx.fillStyle = '#97A2B0';
    ctx.font = '12px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText(`ahantime.com · ${tCommon('tagline')}`, width / 2, height - footerH / 2);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ahantime-${title}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('imageDownloaded'));
    });
  };

  // The visible button text stays «اکسل»/«چاپ»/«تصویر» — three words the eye
  // scans instantly — while the accessible name gains the scope. It has to
  // CONTAIN the visible text, not replace it (WCAG 2.2 §2.5.3 Label in Name),
  // which is why the factory name is appended rather than substituted.
  const scoped = (label: string) => (scopeLabel ? `${label} ${scopeLabel}` : undefined);
  const iconSize = compact ? 16 : 18;
  return (
    <div
      className={compact ? `${styles.menu} ${styles.compact}` : styles.menu}
      role="group"
      aria-label={scopeLabel ? t('exportGroupAriaScoped', { scope: scopeLabel }) : t('exportGroupAria')}
    >
      <button type="button" className={styles.btn} onClick={exportXls} aria-label={scoped(t('excel'))}>
        <SheetIcon size={iconSize} /> <span>{t('excel')}</span>
      </button>
      <button type="button" className={styles.btn} onClick={print} aria-label={scoped(t('print'))}>
        <PrintIcon size={iconSize} /> <span>{t('print')}</span>
      </button>
      <button type="button" className={styles.btn} onClick={exportImage} aria-label={scoped(t('image'))}>
        <ImageIcon size={iconSize} /> <span>{t('image')}</span>
      </button>
    </div>
  );
}
