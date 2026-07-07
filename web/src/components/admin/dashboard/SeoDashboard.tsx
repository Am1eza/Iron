'use client';
/**
 * سئو — self-computed content health: weighted score (meta 30 / depth 25 /
 * cadence 25 / freshness 20), on-page pass-rates, and the actionable part — the
 * exact articles failing each check. Now token-driven (Gauge/MeterBar chart
 * primitives), no inline grids or hardcoded hex.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { Badge, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import { Gauge } from '@/components/admin/charts/Gauge';
import { MeterBar } from '@/components/admin/charts/MeterBar';
import ui from '../adminUi.module.css';
import styles from './dashboard.module.css';

const fa = (n: number) => toPersianDigits(n);

export function SeoDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'stats', 'seo'],
    queryFn: () => adminApi.statsSeo(),
    refetchInterval: 300_000,
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError || !data)
    return (
      <EmptyState size="section" tone="error" headline="خطا در دریافت آمار" primary={{ label: 'تلاش دوباره', onClick: () => refetch() }} />
    );

  return (
    <div className={styles.sections}>
      <section className={ui.panel} aria-labelledby="seo-score">
        <div className={styles.scoreHead}>
          <Gauge value={data.score} sub="از ۱۰۰" label={`امتیاز سئو: ${fa(data.score)} از ۱۰۰`} />
          <div className={styles.scoreMeters}>
            <Heading level={2} id="seo-score">
              سلامت سئوی محتوا
            </Heading>
            <MeterBar label="عنوان (۲۰–۶۵ نویسه)" pct={data.titlePassRate} title="عنوان خیلی کوتاه/بلند در نتایج بریده می‌شود" />
            <MeterBar label="توضیح متا (۷۰–۱۶۰)" pct={data.excerptPassRate} title="excerpt مقاله همان meta description است" />
            <MeterBar label="عمق محتوا (≥۳۰۰ کلمه)" pct={data.thinPassRate} title="محتوای کم‌عمق شانس رتبه ندارد" />
          </div>
          <div className={styles.scoreFacts}>
            <span className={ui.tileHint}>
              انتشار ۳۰ روز اخیر: <strong className="tnum">{fa(data.publishedLast30)}</strong> (هدف: ≥۴)
            </span>
            <span className={ui.tileHint}>
              آخرین انتشار:{' '}
              <strong className="tnum">
                {data.daysSinceLastPublish === null ? 'هرگز' : `${fa(data.daysSinceLastPublish)} روز پیش`}
              </strong>
            </span>
            <span className={ui.tileHint}>
              منتشرشده: <strong className="tnum">{fa(data.published)}</strong> · پیش‌نویس:{' '}
              <strong className="tnum">{fa(data.drafts)}</strong>
            </span>
          </div>
        </div>
      </section>

      <section className={ui.panel} aria-labelledby="seo-failing">
        <Heading level={2} id="seo-failing">
          مقاله‌های نیازمند اصلاح
        </Heading>
        <Text color="muted">بدترین‌ها اول — همین فهرست، برنامهٔ کاری سردبیر است.</Text>
        {data.failing.length === 0 ? (
          <EmptyState size="inline" headline="همهٔ مقاله‌های منتشرشده سالم‌اند 🎉" />
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">مقاله</th>
                <th scope="col">کلمات</th>
                <th scope="col">عنوان</th>
                <th scope="col">توضیح متا</th>
                <th scope="col">عمق</th>
              </tr>
            </thead>
            <tbody>
              {data.failing.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/guides/${a.slug}`} target="_blank" rel="noreferrer">
                      {a.title}
                    </Link>
                  </td>
                  <td className="tnum">{fa(a.words)}</td>
                  <td>{a.titleOk ? <Badge tone="success">✓</Badge> : <Badge tone="loss">اصلاح</Badge>}</td>
                  <td>{a.excerptOk ? <Badge tone="success">✓</Badge> : <Badge tone="loss">اصلاح</Badge>}</td>
                  <td>{a.thinOk ? <Badge tone="success">✓</Badge> : <Badge tone="loss">کم‌عمق</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={ui.panel} aria-labelledby="seo-auto">
        <Heading level={2} id="seo-auto">
          تضمین‌شده توسط سیستم
        </Heading>
        <Text color="muted">این موارد در کد اعمال می‌شوند و نیاز به بررسی دستی ندارند.</Text>
        <ul className={styles.autoList}>
          {data.automated.map((c) => (
            <li key={c.label}>
              <Badge tone="success">✓</Badge> {c.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
