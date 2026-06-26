/** 404 — branded, no dead-ends (empty-states catalog). */
import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function NotFound() {
  return (
    <div
      className="container"
      style={{ paddingBlock: 'var(--space-24)', textAlign: 'center', maxInlineSize: 480 }}
    >
      <h1>این صفحه پیدا نشد</h1>
      <p
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          marginBlockStart: 'var(--space-3)',
        }}
      >
        شاید آدرس عوض شده باشد. از جستجو یا پولادین کمک بگیرید.
      </p>
      <p className="cluster" style={{ justifyContent: 'center', marginBlockStart: 'var(--space-6)' }}>
        <Link href={routes.home()}>بازگشت به خانه</Link>
        <span aria-hidden>·</span>
        <Link href={routes.prices()}>قیمت‌ها</Link>
        <span aria-hidden>·</span>
        <Link href={routes.ai()}>پرسش از پولادین</Link>
      </p>
    </div>
  );
}
