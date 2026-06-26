/**
 * Dev-only page placeholder — gives each route a real, labeled shell until its
 * section is built. Uses design tokens (no hardcoded values).
 */
import Link from 'next/link';
import { routes } from '@/lib/routes';

export function PagePlaceholder({
  title,
  eyebrow,
  note,
}: {
  title: string;
  eyebrow?: string;
  note?: string;
}) {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      {eyebrow ? (
        <p style={{ font: 'var(--t-overline)', color: 'var(--color-text-muted)' }}>{eyebrow}</p>
      ) : null}
      <h1 style={{ marginBlockStart: 'var(--space-2)' }}>{title}</h1>
      <p
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          marginBlockStart: 'var(--space-3)',
        }}
      >
        {note ?? 'این صفحه در بخش مربوطهٔ لایهٔ فرانت‌اند ساخته می‌شود.'}
      </p>
      <p style={{ marginBlockStart: 'var(--space-6)' }}>
        <Link href={routes.home()}>← بازگشت به خانه</Link>
      </p>
    </div>
  );
}
