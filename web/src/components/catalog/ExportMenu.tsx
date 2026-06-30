'use client';
import { useToast } from '@/lib/hooks/useToast';
import { formatToman, formatMovement, toPersianDigits, formatJalali } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import { SheetIcon, PrintIcon, ImageIcon } from '@/components/primitives/icons';
import styles from './ExportMenu.module.css';

/**
 * E5 · Table exports — Excel (CSV, UTF-8 BOM so Excel reads Persian), Print (a
 * clean branded sheet), and Image-with-logo (PNG via canvas). All client-side,
 * no dependency. The branded header carries «آهن‌تایم» + the date.
 */
const COLS = ['محصول', 'سایز', 'کارخانه', 'وزن شاخه (kg)', 'قیمت (تومان)', 'نوسان', 'زمان تحویل'];

function rowCells(r: PriceRow): string[] {
  return [
    r.name,
    r.size ? toPersianDigits(r.size) : '—',
    r.factory ?? '—',
    r.theoreticalWeightKg ? toPersianDigits(String(r.theoreticalWeightKg)) : '—',
    formatToman(r.current.price, false),
    formatMovement(r.current.movementPct),
    r.current.deliveryTime,
  ];
}

export function ExportMenu({ rows, title }: { rows: PriceRow[]; title: string }) {
  const toast = useToast();
  const today = formatJalali('2026-06-27');

  // Branded spreadsheet — a styled HTML table saved as .xls (Excel opens it with
  // the branding + RTL intact). Header carries «آهن‌تایم» + the date; green header
  // row, zebra rows. No dependency; for a true .xlsx with an embedded raster logo,
  // swap in exceljs later.
  const exportXls = () => {
    const head = `<tr>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const body = rows
      .map(
        (r, i) =>
          `<tr class="${i % 2 ? 'even' : ''}">${rowCells(r)
            .map((c) => `<td>${c}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    const cols = COLS.length;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>قیمت ${title}</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        table{border-collapse:collapse;font-family:Tahoma,'B Nazanin',sans-serif;}
        .brand{font-size:20px;font-weight:800;color:#171C22;}
        .brand .a{color:#0F8A63;}
        .meta{color:#64707E;font-size:12px;}
        .foot{color:#97A2B0;font-size:11px;}
        th{background:#0F8A63;color:#FFFFFF;font-weight:700;border:1px solid #0B6B4F;padding:8px 10px;text-align:right;}
        td{border:1px solid #E5E9F0;padding:6px 10px;text-align:right;font-size:12px;color:#171C22;mso-number-format:'\\@';}
        tr.even td{background:#F4F7FA;}
      </style></head><body>
      <table dir="rtl" border="0">
        <tr><td colspan="${cols}" style="border:none;padding:6px 0 0;"><span class="brand">آهن‌<span class="a">تایم</span></span></td></tr>
        <tr><td colspan="${cols}" style="border:none;padding:2px 0 12px;"><span class="meta">قیمت روز ${title} · ${today}</span></td></tr>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
        <tr><td colspan="${cols}" style="border:none;padding-top:12px;"><span class="foot">ahantime.com · اول مشورت، بعد خرید</span></td></tr>
      </table>
    </body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ahantime-${title}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('فایل اکسل برنددار دانلود شد.');
  };

  const print = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const head = `<tr>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const body = rows
      .map((r) => `<tr>${rowCells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('');
    win.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${title} — آهن‌تایم</title>
      <style>
        body{font-family:Tahoma,sans-serif;color:#171C22;padding:24px;}
        .bar{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #171C22;padding-bottom:12px;margin-bottom:16px;}
        .brand{font-size:22px;font-weight:800;} .brand span{color:#0F8A63;}
        .meta{color:#64707E;font-size:13px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th,td{border:1px solid #E5E9F0;padding:8px 10px;text-align:right;}
        th{background:#F4F7FA;} tr:nth-child(even) td{background:#FAFBFD;}
        .foot{margin-top:16px;color:#97A2B0;font-size:12px;text-align:center;}
      </style></head><body>
      <div class="bar"><div class="brand">آهن‌<span>تایم</span></div><div class="meta">قیمت روز ${title} · ${today}</div></div>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>
      <div class="foot">ahantime.com · اول مشورت، بعد خرید</div>
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
    const colW = [260, 80, 140, 120, 150, 110, 130];
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
    ctx.fillStyle = '#0F8A63';
    ctx.fillRect(width - padX - 150, 56, 150, 3);
    ctx.fillStyle = '#64707E';
    ctx.font = '14px Tahoma';
    ctx.fillText(`قیمت روز ${title} · ${today}`, width - padX, 78);

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
      rowCells(r).forEach((cell, i) => {
        ctx.fillText(cell, x2, yy + rowH / 2);
        x2 -= colW[i]!;
      });
    });

    // footer
    ctx.fillStyle = '#97A2B0';
    ctx.font = '12px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('ahantime.com · اول مشورت، بعد خرید', width / 2, height - footerH / 2);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ahantime-${title}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تصویر جدول با لوگو دانلود شد.');
    });
  };

  return (
    <div className={styles.menu} role="group" aria-label="خروجی جدول">
      <button type="button" className={styles.btn} onClick={exportXls}>
        <SheetIcon size={18} /> <span>اکسل</span>
      </button>
      <button type="button" className={styles.btn} onClick={print}>
        <PrintIcon size={18} /> <span>چاپ</span>
      </button>
      <button type="button" className={styles.btn} onClick={exportImage}>
        <ImageIcon size={18} /> <span>تصویر</span>
      </button>
    </div>
  );
}
