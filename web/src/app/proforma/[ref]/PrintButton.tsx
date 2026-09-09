'use client';
import { useTranslations } from 'next-intl';
import { PrintIcon } from '@/components/primitives/icons';
import styles from './proforma.module.css';

/**
 * «دانلود / چاپ PDF» — triggers the browser's print dialog, which on every
 * platform offers "Save as PDF". Print-to-PDF (not a server PDF library) is the
 * most robust route for this document: it reuses the page's own Vazirmatn/
 * Estedad fonts and shaping (RTL for fa/ar, LTR for en/zh), which server PDF
 * generators get wrong. The @media print stylesheet hides everything but the
 * letterhead sheet.
 */
export function PrintButton() {
  const t = useTranslations('proforma');
  return (
    <button type="button" className={styles.printBtn} onClick={() => window.print()}>
      <PrintIcon size={18} aria-hidden="true" />
      {t('printButton')}
    </button>
  );
}
