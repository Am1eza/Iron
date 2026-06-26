import Link from 'next/link';
import { toPersianDigits } from '@/lib/utils/format';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './Pagination.module.css';

/**
 * D9 · Pagination — numbered pager «‹ ۱ ۲ ۳ ›» (arrows mirror for RTL). `hrefFor`
 * builds each page URL so it stays a real, crawlable link (rel prev/next set by page).
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (p: number) => string;
}) {
  if (pageCount <= 1) return null;
  const pages = windowed(page, pageCount);

  return (
    <nav className={styles.nav} aria-label="صفحه‌بندی">
      <PageLink
        href={page > 1 ? hrefFor(page - 1) : undefined}
        label="قبلی"
        icon={<ChevronStartIcon size={18} className="icon--rtl" />}
      />
      <ul className={styles.list}>
        {pages.map((p, i) =>
          p === '…' ? (
            <li key={`gap-${i}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                className={`${styles.page} tnum`}
                aria-current={p === page ? 'page' : undefined}
                data-active={p === page ? '' : undefined}
              >
                {toPersianDigits(p)}
              </Link>
            </li>
          ),
        )}
      </ul>
      <PageLink
        href={page < pageCount ? hrefFor(page + 1) : undefined}
        label="بعدی"
        icon={<ChevronEndIcon size={18} className="icon--rtl" />}
      />
    </nav>
  );
}

function PageLink({
  href,
  label,
  icon,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className={`${styles.arrow} ${styles.disabled}`} aria-disabled="true">
        {icon}
        <span className="visually-hidden">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} className={styles.arrow} aria-label={label} rel={label === 'بعدی' ? 'next' : 'prev'}>
      {icon}
    </Link>
  );
}

/** Build a compact page window with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function windowed(page: number, count: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const push = (n: number) => out.push(n);
  const lo = Math.max(2, page - 1);
  const hi = Math.min(count - 1, page + 1);
  push(1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) push(p);
  if (hi < count - 1) out.push('…');
  if (count > 1) push(count);
  return out;
}
