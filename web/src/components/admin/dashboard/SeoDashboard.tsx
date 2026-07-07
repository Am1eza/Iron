'use client';
/**
 * سئو — self-computed health: weighted score (meta 30 / depth 25 / cadence 25 /
 * freshness 20), on-page pass-rates, and the actionable part — the exact
 * articles failing each check, worst first. No external API needed; the
 * checks run on our own content, the same ones crawler tools grade.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { Badge, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import ui from '../adminUi.module.css';

const fa = (n: number) => toPersianDigits(n);

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? 'var(--color-accent)' : score >= 55 ? '#d97706' : '#dc2626';
  return (
    <svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`امتیاز سئو: ${fa(score)} از ۱۰۰`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-surface-sunken)" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="48" textAnchor="middle" style={{ font: 'var(--t-h4)', fill: 'var(--color-text-strong)' }}>
        {fa(score)}
      </text>
    </svg>
  );
}

function PassRateRow({ label, rate, hint }: { label: string; rate: number; hint: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '11rem 1fr 4rem', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span>{label}</span>
      <div style={{ background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-pill)', blockSize: 10 }} title={hint}>
        <div
          style={{
            inlineSize: `${Math.max(2, rate)}%`,
            blockSize: '100%',
            borderRadius: 'var(--radius-pill)',
            background: rate >= 80 ? 'var(--color-accent)' : rate >= 50 ? '#d97706' : '#dc2626',
          }}
        />
      </div>
      <span className="tnum" style={{ textAlign: 'end' }}>{fa(rate)}٪</span>
    </div>
  );
}

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
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <section className={ui.panel} aria-labelledby="seo-score" style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <ScoreRing score={data.score} />
        <div style={{ flex: 1, minInlineSize: '16rem', display: 'grid', gap: 'var(--space-3)' }}>
          <Heading level={2} id="seo-score">سلامت سئوی محتوا</Heading>
          <PassRateRow label="عنوان (۲۰–۶۵ نویسه)" rate={data.titlePassRate} hint="عنوان خیلی کوتاه/بلند در نتایج بریده می‌شود" />
          <PassRateRow label="توضیح متا (۷۰–۱۶۰ نویسه)" rate={data.excerptPassRate} hint="excerpt مقاله همان meta description است" />
          <PassRateRow label="عمق محتوا (≥۳۰۰ کلمه)" rate={data.thinPassRate} hint="محتوای کم‌عمق شانس رتبه ندارد" />
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
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
      </section>

      <section className={ui.panel} aria-labelledby="seo-failing">
        <Heading level={2} id="seo-failing">مقاله‌های نیازمند اصلاح</Heading>
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
        <Heading level={2} id="seo-auto">تضمین‌شده توسط سیستم</Heading>
        <Text color="muted">این موارد در کد اعمال می‌شوند و نیاز به بررسی دستی ندارند.</Text>
        <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
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
