/**
 * Admin analytics — overview / marketing / SEO dashboards.
 *
 * Period math (the part dashboards usually get wrong):
 *  - Deltas compare COMPLETE aligned windows only: the last 7 *full* days
 *    [todayMidnight−7d, todayMidnight) vs the 7 before them — never a partial
 *    "today" against a full week (partial-period distortion).
 *  - Sparkline series include today as an explicitly-partial last point; the
 *    UI renders it distinct («تا این لحظه»).
 *  - pctDelta guards prior=0 (returns null → UI shows «جدید», never ∞).
 *  - Response time uses median + p90 (percentile_cont), not mean — one
 *    forgotten weekend lead must not swamp the metric.
 *  - Funnel rates are per entry cohort: of the leads CREATED in the window,
 *    how many (ever) reached proforma/order — not cross-period division.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';

/* ------------------------------ pure math ------------------------------ */

/** Percent delta vs prior; null when prior is 0 (render «جدید»/«—»). */
export function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

export interface SeoArticleCheck {
  id: string;
  slug: string;
  title: string;
  titleOk: boolean;
  excerptOk: boolean;
  thinOk: boolean;
  words: number;
}

/** Per-article on-page checks (industry-standard bounds). */
export function checkArticleSeo(a: { id: string; slug: string; title: string; excerpt: string | null; bodyMd: string }): SeoArticleCheck {
  const words = a.bodyMd.trim() ? a.bodyMd.trim().split(/\s+/).length : 0;
  const titleLen = a.title.trim().length;
  const excerptLen = (a.excerpt ?? '').trim().length;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    // Persian titles run denser than Latin — 20–65 chars is the practical band.
    titleOk: titleLen >= 20 && titleLen <= 65,
    excerptOk: excerptLen >= 70 && excerptLen <= 160,
    thinOk: words >= 300,
    words,
  };
}

export interface SeoScoreInput {
  titlePassRate: number; // 0..1
  excerptPassRate: number;
  thinPassRate: number;
  publishedLast30: number;
  daysSinceLastPublish: number | null; // null = never
}

/** Weighted health score (0–100). Weights follow audit-tool convention:
 *  on-page meta 30, content depth 25, cadence 25, freshness 20. */
export function computeSeoScore(i: SeoScoreInput): number {
  const meta = (i.titlePassRate + i.excerptPassRate) / 2;
  const cadence = Math.min(1, i.publishedLast30 / 4); // ≥4 posts/30d = full marks
  const freshness =
    i.daysSinceLastPublish === null ? 0 : Math.max(0, Math.min(1, (60 - i.daysSinceLastPublish) / 46)); // ≤14d full, 60d zero
  const score = 100 * (0.3 * meta + 0.25 * i.thinPassRate + 0.25 * cadence + 0.2 * freshness);
  return Math.round(score);
}

/* ------------------------------ SQL helpers ------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type Row = Record<string, unknown>;
async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const db = getDb();
  const res = (await db.execute(query)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

/** Daily counts for the last `days` days INCLUDING today (partial last point). */
async function dailySeries(table: string, dateCol: string, days: number, extraWhere = ''): Promise<number[]> {
  const start = new Date(todayMidnight().getTime() - (days - 1) * DAY_MS);
  const r = await rows(sql`
    SELECT d.day::date AS day, count(t.*)::int AS n
    FROM generate_series(${start.toISOString()}::timestamptz, now(), '1 day') AS d(day)
    LEFT JOIN ${sql.raw(table)} t
      ON t.${sql.raw(dateCol)} >= d.day AND t.${sql.raw(dateCol)} < d.day + interval '1 day'
      ${sql.raw(extraWhere)}
    GROUP BY d.day ORDER BY d.day
  `);
  return r.map((x) => Number(x.n));
}

/** Count in [todayMidnight−daysBack, todayMidnight−daysBack+len). */
async function windowCount(table: string, dateCol: string, daysBack: number, len: number, extraWhere = ''): Promise<number> {
  const end = new Date(todayMidnight().getTime() - (daysBack - len) * DAY_MS);
  const start = new Date(todayMidnight().getTime() - daysBack * DAY_MS);
  const r = await rows(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} t
    WHERE t.${sql.raw(dateCol)} >= ${start.toISOString()}::timestamptz
      AND t.${sql.raw(dateCol)} < ${end.toISOString()}::timestamptz
      ${sql.raw(extraWhere)}
  `);
  return Number(r[0]?.n ?? 0);
}

export interface Kpi {
  current: number; // last 7 FULL days
  prior: number; // the 7 before
  deltaPct: number | null;
  today: number; // partial, shown separately
  series: number[]; // last 30 days incl today
}

async function kpi(table: string, dateCol: string, extraWhere = ''): Promise<Kpi> {
  const [current, prior, today, series] = await Promise.all([
    windowCount(table, dateCol, 7, 7, extraWhere),
    windowCount(table, dateCol, 14, 7, extraWhere),
    // daysBack=0,len=1 → [todayMidnight, todayMidnight+1d): today's partial count.
    windowCount(table, dateCol, 0, 1, extraWhere),
    dailySeries(table, dateCol, 30, extraWhere),
  ]);
  return { current, prior, deltaPct: pctDelta(current, prior), today, series };
}

/* ------------------------------- overview ------------------------------- */

export interface OverviewStats {
  leads: Kpi;
  proformas: Kpi & { valueCurrent: number; valuePrior: number; valueDeltaPct: number | null };
  orders: Kpi;
  newUsers: Kpi;
  aiConversations: Kpi;
}

export async function overviewStats(): Promise<OverviewStats> {
  const [leadsK, ordersK, usersK, aiK, profK, profValues] = await Promise.all([
    kpi('leads', 'created_at', 'AND t.deleted_at IS NULL'),
    kpi('orders', 'placed_at', 'AND t.deleted_at IS NULL'),
    kpi('users', 'created_at'),
    kpi('ai_conversations', 'created_at'),
    kpi('proformas', 'created_at'),
    rows(sql`
      SELECT
        coalesce(sum(total) FILTER (WHERE created_at >= now()::date - 7 AND created_at < now()::date), 0)::bigint AS cur,
        coalesce(sum(total) FILTER (WHERE created_at >= now()::date - 14 AND created_at < now()::date - 7), 0)::bigint AS prev
      FROM proformas
    `),
  ]);
  const valueCurrent = Number(profValues[0]?.cur ?? 0);
  const valuePrior = Number(profValues[0]?.prev ?? 0);
  return {
    leads: leadsK,
    proformas: { ...profK, valueCurrent, valuePrior, valueDeltaPct: pctDelta(valueCurrent, valuePrior) },
    orders: ordersK,
    newUsers: usersK,
    aiConversations: aiK,
  };
}

/* ------------------------------- marketing ------------------------------- */

export interface MarketingStats {
  /** Per-source over the last 90 full days, quality first: won-rate matters more than volume. */
  bySource: Array<{ source: string; leads: number; won: number; proformas: number; wonRate: number | null }>;
  /** Entry-cohort funnel over the last 30 FULL days. */
  funnel: { conversations: number; leads: number; proformas: number; orders: number };
  /** Speed-to-lead (minutes) over the last 30 full days: median + p90 of
   *  lead.created_at → first staff touch (audit entry or note on that lead). */
  responseMinutes: { median: number | null; p90: number | null; measured: number };
  /** Among users with ≥1 lead in 90d, share with ≥2 (repeat engagement). */
  repeatRate: { repeat: number; total: number; rate: number | null };
  sms: Array<{ kind: string; status: string; n: number }>;
}

export async function marketingStats(): Promise<MarketingStats> {
  const [bySource, funnelConv, funnelRest, resp, repeat, sms] = await Promise.all([
    rows(sql`
      SELECT l.source,
             count(*)::int AS leads,
             count(*) FILTER (WHERE l.status = 'won')::int AS won,
             count(DISTINCT p.lead_id)::int AS proformas
      FROM leads l
      LEFT JOIN proformas p ON p.lead_id = l.id
      WHERE l.created_at >= now()::date - 90 AND l.deleted_at IS NULL
      GROUP BY l.source ORDER BY leads DESC
    `),
    rows(sql`
      SELECT count(*)::int AS n FROM ai_conversations
      WHERE created_at >= now()::date - 30 AND created_at < now()::date
    `),
    rows(sql`
      SELECT
        count(*)::int AS leads,
        count(DISTINCT p.lead_id)::int AS proformas,
        count(DISTINCT o.lead_id)::int AS orders
      FROM leads l
      LEFT JOIN proformas p ON p.lead_id = l.id
      LEFT JOIN orders o ON o.lead_id = l.id AND o.deleted_at IS NULL
      WHERE l.created_at >= now()::date - 30 AND l.created_at < now()::date AND l.deleted_at IS NULL
    `),
    rows(sql`
      WITH first_touch AS (
        SELECT l.id, l.created_at,
               least(
                 (SELECT min(a.at) FROM audit_entries a WHERE a.entity_type = 'lead' AND a.entity_id = l.id AND a.at > l.created_at),
                 (SELECT min(n.at) FROM lead_notes n WHERE n.lead_id = l.id)
               ) AS touched_at
        FROM leads l
        WHERE l.created_at >= now()::date - 30 AND l.created_at < now()::date AND l.deleted_at IS NULL
      )
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM touched_at - created_at) / 60) AS median,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM touched_at - created_at) / 60) AS p90,
        count(touched_at)::int AS measured
      FROM first_touch WHERE touched_at IS NOT NULL
    `),
    rows(sql`
      WITH per_user AS (
        SELECT user_id, count(*)::int AS n FROM leads
        WHERE created_at >= now()::date - 90 AND user_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY user_id
      )
      SELECT count(*)::int AS total, count(*) FILTER (WHERE n >= 2)::int AS repeat FROM per_user
    `),
    rows(sql`
      SELECT kind, status, count(*)::int AS n FROM sms_log
      WHERE at >= now()::date - 30 GROUP BY kind, status ORDER BY kind, status
    `),
  ]);

  const f = funnelRest[0] ?? {};
  const rp = repeat[0] ?? {};
  const total = Number(rp.total ?? 0);
  const repeatN = Number(rp.repeat ?? 0);
  const round1 = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  return {
    bySource: bySource.map((r) => {
      const leadsN = Number(r.leads);
      const wonN = Number(r.won);
      return {
        source: String(r.source),
        leads: leadsN,
        won: wonN,
        proformas: Number(r.proformas),
        wonRate: leadsN > 0 ? Math.round((wonN / leadsN) * 1000) / 10 : null,
      };
    }),
    funnel: {
      conversations: Number(funnelConv[0]?.n ?? 0),
      leads: Number(f.leads ?? 0),
      proformas: Number(f.proformas ?? 0),
      orders: Number(f.orders ?? 0),
    },
    responseMinutes: {
      median: round1(resp[0]?.median),
      p90: round1(resp[0]?.p90),
      measured: Number(resp[0]?.measured ?? 0),
    },
    repeatRate: {
      repeat: repeatN,
      total,
      rate: total > 0 ? Math.round((repeatN / total) * 1000) / 10 : null,
    },
    sms: sms.map((r) => ({ kind: String(r.kind), status: String(r.status), n: Number(r.n) })),
  };
}

/* ---------------------------- cohort retention ---------------------------- */

export interface CohortRetention {
  columns: string[]; // "ماه ۰", "ماه ۱", …
  rows: Array<{ label: string; size: number; cells: (number | null)[] }>;
}

/**
 * Signup-cohort retention: rows = the month a user registered (last 6 months),
 * columns = months since signup, cell = % of that cohort with ≥1 delivered
 * order in that month-offset. Periods that haven't elapsed yet are null (shown
 * blank). Reveals whether newer cohorts stick better than older ones.
 */
export async function cohortRetention(months = 6): Promise<CohortRetention> {
  // retained[user,period] and cohort sizes, pivoted in JS.
  const raw = await rows(sql`
    WITH cohort AS (
      SELECT id AS user_id, date_trunc('month', created_at) AS m0
      FROM users
      WHERE created_at >= date_trunc('month', now()) - (${months - 1} || ' months')::interval
    ),
    retained AS (
      SELECT c.user_id, c.m0,
        (extract(year FROM age(date_trunc('month', o.placed_at), c.m0)) * 12
         + extract(month FROM age(date_trunc('month', o.placed_at), c.m0)))::int AS period
      FROM cohort c
      JOIN orders o ON o.user_id = c.user_id AND o.deleted_at IS NULL AND o.status = 'delivered'
    )
    SELECT to_char(c.m0, 'YYYY-MM') AS cohort,
           extract(epoch FROM c.m0)::bigint AS m0_epoch,
           count(DISTINCT c.user_id)::int AS size,
           r.period,
           count(DISTINCT r.user_id)::int AS retained
    FROM cohort c
    LEFT JOIN retained r ON r.user_id = c.user_id AND r.period BETWEEN 0 AND ${months - 1}
    GROUP BY c.m0, r.period
    ORDER BY c.m0
  `);

  // Pivot: cohort → { size, epoch, retained[period] }.
  const byCohort = new Map<string, { epoch: number; size: number; retained: Map<number, number> }>();
  for (const r of raw) {
    const key = String(r.cohort);
    const entry = byCohort.get(key) ?? { epoch: Number(r.m0_epoch), size: Number(r.size), retained: new Map() };
    entry.size = Number(r.size);
    if (r.period !== null && r.period !== undefined) entry.retained.set(Number(r.period), Number(r.retained));
    byCohort.set(key, entry);
  }

  const columns = Array.from({ length: months }, (_, i) => `ماه ${toFa(i)}`);
  const nowMonthIdx = (epoch: number) => {
    const then = new Date(epoch * 1000);
    const now = new Date();
    return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  };
  const cohortRows = Array.from(byCohort.values())
    .sort((a, b) => b.epoch - a.epoch) // newest first
    .map((e) => {
      const elapsed = nowMonthIdx(e.epoch);
      const cells = Array.from({ length: months }, (_, p) => {
        if (p > elapsed) return null; // period hasn't happened yet
        const ret = e.retained.get(p) ?? 0;
        return e.size > 0 ? Math.round((ret / e.size) * 100) : 0;
      });
      return { label: jalaliMonthLabel(new Date(e.epoch * 1000)), size: e.size, cells };
    });
  return { columns, rows: cohortRows };
}

function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}
/** Short Jalali «YYYY/MM»-ish label for a cohort month (first-of-month date). */
function jalaliMonthLabel(d: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long' });
    return fmt.format(d);
  } catch {
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  }
}

/* --------------------------------- SEO --------------------------------- */

export interface SeoStats {
  score: number;
  published: number;
  drafts: number;
  publishedLast30: number;
  daysSinceLastPublish: number | null;
  titlePassRate: number;
  excerptPassRate: number;
  thinPassRate: number;
  failing: SeoArticleCheck[]; // published articles failing ≥1 check (worst first)
  /** Guarantees enforced by code at render time — shown as automated passes. */
  automated: Array<{ label: string; ok: true }>;
}

export async function seoStats(): Promise<SeoStats> {
  const [arts, counts, lastPub] = await Promise.all([
    rows(sql`SELECT id, slug, title, excerpt, body_md AS "bodyMd" FROM articles WHERE status = 'published'`),
    rows(sql`
      SELECT
        count(*) FILTER (WHERE status = 'published')::int AS published,
        count(*) FILTER (WHERE status = 'draft')::int AS drafts,
        count(*) FILTER (WHERE status = 'published' AND publish_at >= now()::date - 30)::int AS pub30
      FROM articles
    `),
    rows(sql`SELECT max(publish_at) AS last FROM articles WHERE status = 'published'`),
  ]);

  const checks = arts.map((a) =>
    checkArticleSeo(a as { id: string; slug: string; title: string; excerpt: string | null; bodyMd: string }),
  );
  const n = checks.length || 1;
  const rate = (pass: (c: SeoArticleCheck) => boolean) => checks.filter(pass).length / n;
  const titlePassRate = rate((c) => c.titleOk);
  const excerptPassRate = rate((c) => c.excerptOk);
  const thinPassRate = rate((c) => c.thinOk);

  const last = lastPub[0]?.last ? new Date(String(lastPub[0].last)) : null;
  const daysSinceLastPublish = last ? Math.floor((Date.now() - last.getTime()) / DAY_MS) : null;
  const c = counts[0] ?? {};
  const publishedLast30 = Number(c.pub30 ?? 0);

  return {
    score: computeSeoScore({ titlePassRate, excerptPassRate, thinPassRate, publishedLast30, daysSinceLastPublish }),
    published: Number(c.published ?? 0),
    drafts: Number(c.drafts ?? 0),
    publishedLast30,
    daysSinceLastPublish,
    titlePassRate: Math.round(titlePassRate * 100),
    excerptPassRate: Math.round(excerptPassRate * 100),
    thinPassRate: Math.round(thinPassRate * 100),
    failing: checks
      .filter((x) => !x.titleOk || !x.excerptOk || !x.thinOk)
      .sort((a, b) => Number(a.thinOk) - Number(b.thinOk) || a.words - b.words)
      .slice(0, 30),
    automated: [
      { label: 'نقشهٔ سایت (sitemap.xml) خودکار از دیتابیس تولید می‌شود', ok: true },
      { label: 'دادهٔ ساخت‌یافتهٔ Product/Offer برای همهٔ صفحات محصول', ok: true },
      { label: 'دادهٔ ساخت‌یافتهٔ NewsArticle برای مقاله‌ها', ok: true },
      { label: 'صفحات دسته/محصول ISR با متا و canonical', ok: true },
    ],
  };
}
