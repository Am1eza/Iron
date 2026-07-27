'use client';
import Link from 'next/link';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { routes } from '@/lib/routes';
import { actionMeta, entityLabel, fieldLabel, diffFields } from './auditVocab';
import styles from './activity.module.css';

export interface AuditRow {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorName?: string | null;
  actorMobile?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * One activity entry, written as a sentence: «<کیف> <کی> <چه کرد> روی <چه چیزی>»,
 * with the field-level diff underneath. The point of the log is answering
 * "who changed this and to what" without reading JSON, so the raw snapshots
 * are the fallback, not the presentation.
 */
export function ActivityItem({ row }: { row: AuditRow }) {
  const meta = actionMeta(row.action);
  const who = row.actorName || (row.actorMobile ? toPersianDigits(row.actorMobile) : null);
  const changes = diffFields(row.before, row.after);
  const href = entityHref(row.entityType, row.entityId);

  return (
    <li className={styles.item}>
      <span className={`${styles.avatar} ${styles[`tone_${meta.tone}`]}`} aria-hidden="true">
        {initials(who)}
      </span>

      <div className={styles.body}>
        <p className={styles.line}>
          <strong className={styles.who}>{who ?? 'سیستم'}</strong> {meta.verb}
          {href ? (
            <>
              {' '}
              روی{' '}
              <Link href={href} className={styles.entity}>
                {entityLabel(row.entityType)} <bdi>{row.entityId}</bdi>
              </Link>
            </>
          ) : (
            <>
              {' '}
              روی <span className={styles.entityPlain}>{entityLabel(row.entityType)}</span>{' '}
              <bdi className={styles.entityId}>{row.entityId}</bdi>
            </>
          )}
        </p>

        <p className={styles.meta}>
          <time dateTime={row.at} className="tnum">
            {formatJalali(row.at, 'yyyy/MM/dd — HH:mm')}
          </time>
          {row.actorName && row.actorMobile ? (
            <> · <span className="tnum">{toPersianDigits(row.actorMobile)}</span></>
          ) : null}
          {' · '}
          <code className={styles.code}>{row.action}</code>
        </p>

        {changes.length > 0 ? (
          <ul className={styles.changes}>
            {changes.slice(0, 6).map((c) => (
              <li key={c.key} className={styles.change}>
                <span className={styles.field}>{fieldLabel(c.key)}</span>
                <span className={styles.from}>{renderValue(c.before)}</span>
                <span className={styles.arrow} aria-hidden="true">
                  ←
                </span>
                <span className={styles.to}>{renderValue(c.after)}</span>
              </li>
            ))}
            {changes.length > 6 ? (
              <li className={styles.moreFields}>
                و {toPersianDigits(changes.length - 6)} تغییر دیگر
              </li>
            ) : null}
          </ul>
        ) : null}

        {row.before || row.after ? (
          <details className={styles.raw}>
            <summary>دادهٔ خام</summary>
            <pre>{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

/** Deep-link the entity when the panel actually has a page for it — the log
 *  is most useful when "who broke the article" is one click from the article. */
function entityHref(type: string, id: string): string | null {
  switch (type) {
    case 'lead':
      return `${routes.admin.leads()}/${encodeURIComponent(id)}`;
    case 'user':
      return `${routes.admin.users()}/${encodeURIComponent(id)}`;
    case 'article':
    case 'content':
      return routes.admin.content();
    case 'sku':
    case 'category':
    case 'sub':
      return routes.admin.catalog();
    case 'order':
      return routes.admin.orders();
    case 'setting':
    case 'settings':
      return routes.admin.settings();
    default:
      return null;
  }
}

/** Persian-friendly value rendering — «—» for empty, «بله/خیر» for booleans,
 *  digits localized, long text clipped so one bodyMd edit can't eat the row. */
function renderValue(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if (typeof v === 'number') return toPersianDigits(v.toLocaleString('en-US'));
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const clipped = s.length > 60 ? `${s.slice(0, 60)}…` : s;
  return toPersianDigits(clipped);
}

function initials(name: string | null): string {
  if (!name) return '⚙';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]![0]}${parts[1]![0]}`;
}
