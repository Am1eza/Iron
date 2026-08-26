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
import { routes } from '@/lib/routes';
import { Badge, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import { Gauge } from '@/components/admin/charts/Gauge';
import { MeterBar } from '@/components/admin/charts/MeterBar';
import ui from '../adminUi.module.css';
import styles from './dashboard.module.css';

const fa = (n: number) => toPersianDigits(n);

/** The article's real public URL — `/guides/{slug}` used to be hardcoded
 *  here regardless of type, and no `/guides` route has ever existed on this
 *  site, so every "go fix this" link 404ed for every article, always. */
const articleHref = (a: { slug: string; type: 'blog' | 'news' }) =>
  a.type === 'news' ? routes.news(a.slug) : routes.blog(a.slug);

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

  const hasPublished = data.published > 0;
  const hiddenFailing = data.failingTotal - data.failing.length;

  return (
    <div className={styles.sections}>
      <section className={ui.panel} aria-labelledby="seo-score">
        {hasPublished ? (
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
        ) : (
          <>
            <Heading level={2} id="seo-score">
              سلامت سئوی محتوا
            </Heading>
            {/* Zero published articles used to compute as a flat 0% on every
                meter — reading as "everything is failing" when the honest
                state is "there's nothing to measure yet". */}
            <EmptyState
              size="inline"
              headline="هنوز مقاله‌ای منتشر نشده"
              body={`${fa(data.drafts)} پیش‌نویس در صف — پس از اولین انتشار، امتیاز و معیارها اینجا محاسبه می‌شوند.`}
            />
          </>
        )}
      </section>

      {data.traffic ? (
        <section className={ui.panel} aria-labelledby="seo-traffic">
          <Heading level={2} id="seo-traffic">
            بازدید واقعی از جست‌وجو — ۳۰ روز گذشته
          </Heading>
          <Text color="muted">
            از Matomo — کدام صفحه‌ها واقعاً از گوگل/بینگ بازدیدکننده می‌گیرند، نه فقط کدام‌ها چک‌لیست بالا را رد
            می‌کنند.
          </Text>
          <div className={styles.miniTiles}>
            <div className={ui.tile}>
              <span className={ui.tileLabel}>بازدید از جست‌وجو</span>
              <span className={`${ui.tileValue} tnum`}>{fa(data.traffic.organicVisits)}</span>
            </div>
            {data.traffic.topSearchEngines.slice(0, 3).map((s) => (
              <div className={ui.tile} key={s.label}>
                <span className={ui.tileLabel}>{s.label}</span>
                <span className={`${ui.tileValue} tnum`}>{fa(s.visits)}</span>
              </div>
            ))}
          </div>
          {data.traffic.topLandingPages.length > 0 ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">صفحهٔ ورودی</th>
                    <th scope="col">بازدید از جست‌وجو</th>
                  </tr>
                </thead>
                <tbody>
                  {data.traffic.topLandingPages.map((p) => (
                    <tr key={p.path}>
                      <td>
                        <a href={p.path} target="_blank" rel="noreferrer">
                          {p.path}
                        </a>
                      </td>
                      <td className="tnum">{fa(p.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState size="inline" headline="در این بازه بازدید از جست‌وجو ثبت نشده" />
          )}
        </section>
      ) : null}

      {hasPublished ? (
        <section className={ui.panel} aria-labelledby="seo-failing">
          <Heading level={2} id="seo-failing">
            مقاله‌های نیازمند اصلاح
          </Heading>
          <Text color="muted">
            بدترین‌ها اول — همین فهرست، برنامهٔ کاری سردبیر است.
            {hiddenFailing > 0 ? ` (${fa(data.failing.length)} مورد از ${fa(data.failingTotal)} نمایش داده می‌شود.)` : ''}
          </Text>
          {data.failing.length === 0 ? (
            <EmptyState size="inline" headline="همهٔ مقاله‌های منتشرشده سالم‌اند 🎉" />
          ) : (
            <div className={ui.tableWrap}><table className={ui.table}>
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
                    <Link href={articleHref(a)} target="_blank" rel="noreferrer">
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
          </table></div>
          )}
        </section>
      ) : null}

      {data.hiddenActiveProducts > 0 ? (
        <section className={ui.panel} aria-labelledby="seo-hidden">
          <Heading level={2} id="seo-hidden">
            محصولات فعال در زیردستهٔ غیرفعال
          </Heading>
          <Text color="muted">
            این <strong className="tnum">{fa(data.hiddenActiveProducts)}</strong> محصول خودشان «فعال»اند ولی چون
            زیردسته‌شان غیرفعال است، در هیچ صفحهٔ دسته، سایت‌مپ یا جست‌وجویی دیده نمی‌شوند — نه لزوماً باگ، شاید کاری
            در حال ساخت باشد؛ تصمیم انتشار با شماست.
          </Text>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">دسته</th>
                  <th scope="col">زیردسته</th>
                  <th scope="col">محصول پنهان</th>
                </tr>
              </thead>
              <tbody>
                {data.hiddenByGroup.map((g) => (
                  <tr key={`${g.category}/${g.subCategory}`}>
                    <td>{g.category}</td>
                    <td>{g.subCategory}</td>
                    <td className="tnum">{fa(g.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={ui.panel} aria-labelledby="seo-auto">
        <Heading level={2} id="seo-auto">
          ویژگی‌های فنی از پیش پیاده‌شده
        </Heading>
        <Text color="muted">
          این‌ها نکات معماری سایتند، نه یک بررسی زنده روی هر بار بازکردن این صفحه — یعنی اگر روزی یکی از این‌ها در
          توسعهٔ آینده خراب شود، همچنان همین‌جا ✓ نمایش داده می‌شود تا کد دوباره بررسی و به‌روزرسانی شود.
        </Text>
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
