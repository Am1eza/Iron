'use client';
import { PrintIcon } from '@/components/primitives/icons';
import styles from './proforma.module.css';

/**
 * «دانلود / چاپ PDF» — triggers the browser's print dialog, which on every
 * platform offers "Save as PDF". Print-to-PDF (not a server PDF library) is the
 * most robust route for a Persian RTL document: it reuses the page's own
 * Vazirmatn/Estedad fonts and shaping, which server PDF generators get wrong.
 * The @media print stylesheet hides everything but the letterhead sheet.
 */
export function PrintButton() {
  return (
    <button type="button" className={styles.printBtn} onClick={() => window.print()}>
      <PrintIcon size={18} aria-hidden="true" />
      دانلود / چاپ PDF
    </button>
  );
}
