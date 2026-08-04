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
  /** Needed to build the correct `/blog/{slug}` vs `/news/{slug}` link — a
   *  single hardcoded `/guides/{slug}` link used to 404 for every article,
   *  every time, since no such route has ever existed on this site. */
  type: 'blog' | 'news';
  titleOk: boolean;
  excerptOk: boolean;
  thinOk: boolean;
  words: number;
}

/**
 * Strips Markdown syntax before counting "words" — raw source markup
 * (headings, `**`/`*` emphasis, link/image syntax, table pipes, list/quote
 * markers) is never part of what a reader actually reads as prose, and
 * counting it inflates the depth check materially: a realistic formatted
 * article (heading + bold + two links + an image + a pricing table + a
 * list) counted ~34% higher unstripped than its true reader-visible word
 * count in a spot check — enough to let genuinely thin content read as
 * `thinOk: true`, hiding it from the "needs work" list this page exists to
 * produce.
 */
function stripMarkdownForWordCount(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images — not read as prose, drop entirely
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links — keep the visible text only
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^>\s?/gm, '') // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, '') // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, '') // ordered list markers
    .replace(/^\|?-{2,}\|?[-|\s]*$/gm, '') // table header-separator rows
    .replace(/\|/g, ' ') // remaining table pipes
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1'); // inline code
}

/** Per-article on-page checks (industry-standard bounds). */
export function checkArticleSeo(a: {
  id: string;
  slug: string;
  title: string;
  type: 'blog' | 'news';
  excerpt: string | null;
  bodyMd: string;
}): SeoArticleCheck {
  const stripped = stripMarkdownForWordCount(a.bodyMd).trim();
  const words = stripped ? stripped.split(/\s+/).length : 0;
  const titleLen = a.title.trim().length;
  const excerptLen = (a.excerpt ?? '').trim().length;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    type: a.type,
    // Persian titles run denser than Latin — 20–65 chars is the practical
    // band this codebase uses; not independently validated against Persian
    // SERP pixel-width data, treat as a working heuristic, not a proven bound.
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

/**
 * The ONLY identifiers that may ever reach `sql.raw` in this file.
 *
 * `dailySeries`/`windowCount` have to interpolate a table name and a date
 * column as SQL IDENTIFIERS — those cannot be bound as parameters, so they go
 * through `sql.raw`. Previously all three fragments (`table`, `dateCol` and a
 * free-form `extraWhere` SQL string) were plain `string` parameters with
 * defaults. Every caller passed a hardcoded literal, so nothing was injectable
 * in practice — but the SIGNATURE invited a caller to pass a request value,
 * and `extraWhere` in particular accepted arbitrary SQL text by design. That
 * is a SQL-injection hole waiting for the next feature that wants to filter a
 * KPI "by whatever the dashboard asked for".
 *
 * Closing it structurally rather than by convention: callers now name a SOURCE,
 * and the table/column/soft-delete predicate are looked up here. `KpiSource` is
 * a closed union of the five keys below, so passing anything else — including
 * any `string` — is a compile error, and no caller-supplied text can reach
 * `sql.raw` at all. The free-form `extraWhere` parameter is deleted outright;
 * the only predicate any caller ever needed was the soft-delete filter, which
 * is now a boolean flag rendering a FIXED fragment.
 */
const KPI_SOURCES = {
  leads: { table: 'leads', dateCol: 'created_at', softDeleted: true },
  orders: { table: 'orders', dateCol: 'placed_at', softDeleted: true },
  users: { table: 'users', dateCol: 'created_at', softDeleted: false },
  ai_conversations: { table: 'ai_conversations', dateCol: 'created_at', softDeleted: false },
  proformas: { table: 'proformas', dateCol: 'created_at', softDeleted: false },
} as const satisfies Record<string, { table: string; dateCol: string; softDeleted: boolean }>;

type KpiSource = keyof typeof KPI_SOURCES;

/** Fixed, caller-independent soft-delete predicate for a source. */
function notDeleted(source: KpiSource) {
  return KPI_SOURCES[source].softDeleted ? sql` AND t.deleted_at IS NULL` : sql``;
}

/** Daily counts for the last `days` days INCLUDING today (partial last point). */
async function dailySeries(source: KpiSource, days: number): Promise<number[]> {
  const { table, dateCol } = KPI_SOURCES[source];
  const start = new Date(todayMidnight().getTime() - (days - 1) * DAY_MS);
  const r = await rows(sql`
    SELECT d.day::date AS day, count(t.*)::int AS n
    FROM generate_series(${start.toISOString()}::timestamptz, now(), '1 day') AS d(day)
    LEFT JOIN ${sql.raw(table)} t
      ON t.${sql.raw(dateCol)} >= d.day AND t.${sql.raw(dateCol)} < d.day + interval '1 day'
      ${notDeleted(source)}
    GROUP BY d.day ORDER BY d.day
  `);
  return r.map((x) => Number(x.n));
}

/** Count in [todayMidnight−daysBack, todayMidnight−daysBack+len). */
async function windowCount(source: KpiSource, daysBack: number, len: number): Promise<number> {
  const { table, dateCol } = KPI_SOURCES[source];
  const end = new Date(todayMidnight().getTime() - (daysBack - len) * DAY_MS);
  const start = new Date(todayMidnight().getTime() - daysBack * DAY_MS);
  const r = await rows(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} t
    WHERE t.${sql.raw(dateCol)} >= ${start.toISOString()}::timestamptz
      AND t.${sql.raw(dateCol)} < ${end.toISOString()}::timestamptz
      ${notDeleted(source)}
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

async function kpi(source: KpiSource): Promise<Kpi> {
  const [current, prior, today, series] = await Promise.all([
    windowCount(source, 7, 7),
    windowCount(source, 14, 7),
    // daysBack=0,len=1 → [todayMidnight, todayMidnight+1d): today's partial count.
    windowCount(source, 0, 1),
    dailySeries(source, 30),
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
    kpi('leads'),
    kpi('orders'),
    kpi('users'),
    kpi('ai_conversations'),
    kpi('proformas'),
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

/** Windows the whole marketing screen. One switch drives every query so no
 *  two panels can silently disagree about what "recently" means. */
export const MARKETING_RANGES = [7, 30, 90] as const;
export type MarketingRange = (typeof MARKETING_RANGES)[number];

/** Row shape shared by the entry-form and campaign breakdowns — same columns,
 *  same meaning, so the UI renders both through one table component. */
export interface AttributionRow {
  key: string;
  leads: number;
  /** Leads that reached a proforma — NOT the proforma count. A lead with 3
   *  proformas counts once, which is what a per-lead funnel rate needs. */
  withProforma: number;
  won: number;
  wonRate: number | null;
  /** Toman actually booked: the sum of proforma totals on WON leads. Counts
   *  alone can't distinguish ten small deals from one large one, which is the
   *  distinction the owner is actually making when allocating spend. */
  wonToman: number;
}

export interface MarketingStats {
  range: MarketingRange;
  /** Which on-site form produced the lead — NOT a marketing channel (a Google
   *  visitor and an Instagram visitor both submit the same price table). See
   *  `byCampaign` for real acquisition attribution. */
  byEntryForm: AttributionRow[];
  /** First-touch campaign attribution (W28). Empty until tagged traffic
   *  arrives; `untagged` carries everything with no campaign so the owner can
   *  see what share of business is unattributed rather than assuming zero. */
  byCampaign: AttributionRow[];
  untaggedLeads: number;
  /** Entry-cohort funnel over the window. Deliberately starts at the lead:
   *  AI conversations are NOT an upstream stage of it (no linkage exists),
   *  so showing them as one fabricated a drop-off that meant nothing. */
  funnel: { leads: number; proformas: number; orders: number };
  /** Context, shown beside the funnel rather than inside it. */
  aiConversations: number;
  /** Speed-to-lead (minutes): median + p90 of lead.created_at → first staff
   *  touch (audit entry or note on that lead). */
  responseMinutes: { median: number | null; p90: number | null; measured: number };
  /** Among users with ≥1 lead in the window, share with ≥2. */
  repeatRate: { repeat: number; total: number; rate: number | null };
  sms: Array<{ kind: string; status: string; n: number }>;
}

export async function marketingStats(range: MarketingRange = 30): Promise<MarketingStats> {
  // ONE window for the whole screen. Previously the funnel used 30 days while
  // the channel table used 90 and the SMS tile used 30-plus-today, so the
  // numbers on one page could not be reconciled against each other.
  // Bound as a parameter, never inlined. `range` is a narrow union and the
  // route validates it against MARKETING_RANGES, but a windowing value that
  // reaches SQL as raw text is exactly what a later refactor widens without
  // noticing.
  const days = sql`${range}::int`;

  // Shared by both attribution breakdowns. Every aggregate is per-LEAD via
  // EXISTS — never a LEFT JOIN, which multiplied a lead by its proforma/order
  // count and inflated these headline numbers (see the W28 fan-out tests).
  // `wonToman` sums proforma totals only on WON leads, so it answers "what did
  // this actually bring in", not "what did we quote".
  const attributionCols = sql`
    count(*)::int AS leads,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM proformas p WHERE p.lead_id = l.id))::int AS with_proforma,
    count(*) FILTER (WHERE l.status = 'won')::int AS won,
    coalesce(sum(
      CASE WHEN l.status = 'won'
        THEN (SELECT coalesce(sum(p2.total), 0) FROM proformas p2 WHERE p2.lead_id = l.id AND p2.status <> 'cancelled')
        ELSE 0 END
    ), 0)::bigint AS won_toman
  `;
  const inWindow = sql`l.created_at >= now()::date - ${days} AND l.created_at < now()::date AND l.deleted_at IS NULL`;

  const [byEntryForm, byCampaign, untagged, aiConv, funnelRest, resp, repeat, sms] = await Promise.all([
    rows(sql`
      SELECT l.source AS key, ${attributionCols}
      FROM leads l WHERE ${inWindow}
      GROUP BY l.source ORDER BY leads DESC
    `),
    // First-touch campaign attribution (W28). Until this existed there was no
    // way to tie ad spend to a closed deal at all.
    rows(sql`
      SELECT l.utm_campaign AS key, ${attributionCols}
      FROM leads l WHERE ${inWindow} AND l.utm_campaign IS NOT NULL
      GROUP BY l.utm_campaign ORDER BY leads DESC LIMIT 50
    `),
    rows(sql`
      SELECT count(*)::int AS n FROM leads l WHERE ${inWindow} AND l.utm_campaign IS NULL
    `),
    rows(sql`
      SELECT count(*)::int AS n FROM ai_conversations
      WHERE created_at >= now()::date - ${days} AND created_at < now()::date
    `),
    // Starts at the lead: an AI conversation is not an upstream funnel stage
    // (nothing links one to a lead), so including it rendered a confident
    // drop-off percentage between two unrelated populations.
    rows(sql`
      SELECT
        count(*)::int AS leads,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM proformas p WHERE p.lead_id = l.id))::int AS proformas,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.lead_id = l.id AND o.deleted_at IS NULL))::int AS orders
      FROM leads l WHERE ${inWindow}
    `),
    rows(sql`
      WITH first_touch AS (
        SELECT l.id, l.created_at,
               least(
                 (SELECT min(a.at) FROM audit_entries a WHERE a.entity_type = 'lead' AND a.entity_id = l.id AND a.at > l.created_at),
                 (SELECT min(n.at) FROM lead_notes n WHERE n.lead_id = l.id)
               ) AS touched_at
        FROM leads l WHERE ${inWindow}
      )
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM touched_at - created_at) / 60) AS median,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM touched_at - created_at) / 60) AS p90,
        count(touched_at)::int AS measured
      FROM first_touch WHERE touched_at IS NOT NULL
    `),
    rows(sql`
      WITH per_user AS (
        SELECT user_id, count(*)::int AS n FROM leads l
        WHERE ${inWindow} AND user_id IS NOT NULL
        GROUP BY user_id
      )
      SELECT count(*)::int AS total, count(*) FILTER (WHERE n >= 2)::int AS repeat FROM per_user
    `),
    rows(sql`
      SELECT kind, status, count(*)::int AS n FROM sms_log
      WHERE at >= now()::date - ${days} AND at < now()::date
      GROUP BY kind, status ORDER BY kind, status
    `),
  ]);

  const toRow = (r: Row): AttributionRow => {
    const leads = Number(r.leads);
    const won = Number(r.won);
    return {
      key: String(r.key),
      leads,
      withProforma: Number(r.with_proforma),
      won,
      wonRate: leads > 0 ? Math.round((won / leads) * 1000) / 10 : null,
      wonToman: Number(r.won_toman ?? 0),
    };
  };

  const f = funnelRest[0] ?? {};
  const rp = repeat[0] ?? {};
  const total = Number(rp.total ?? 0);
  const repeatN = Number(rp.repeat ?? 0);
  const round1 = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  return {
    range,
    byEntryForm: byEntryForm.map(toRow),
    byCampaign: byCampaign.map(toRow),
    untaggedLeads: Number(untagged[0]?.n ?? 0),
    aiConversations: Number(aiConv[0]?.n ?? 0),
    funnel: {
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

/* --------------------------- dormant customers --------------------------- */

export interface DormantCustomer {
  userId: string;
  name: string | null;
  mobile: string;
  lastOrderAt: string;
  daysSince: number;
  ordersTotal: number;
  lifetimeToman: number;
}

/**
 * Customers who bought before but have gone quiet (W28) — the replacement for
 * a signup-cohort retention heatmap on the marketing page.
 *
 * A retention grid answers "does month-3 usage hold up", which is the right
 * question for a subscription product and the wrong one for steel: purchases
 * here are large, irregular and months apart, so a 0% month is normal rather
 * than a problem, and there is no lever the owner can pull in response. This
 * returns the same underlying signal as something he can act on this
 * afternoon — a call list, ordered by how much the customer is worth.
 */
export async function dormantCustomers(sinceDays = 90, limit = 50): Promise<DormantCustomer[]> {
  const r = await rows(sql`
    SELECT u.id AS user_id, u.name, u.mobile,
           max(o.placed_at) AS last_order_at,
           count(*)::int AS orders_total,
           coalesce(sum(
             (SELECT coalesce(sum(p.total), 0) FROM proformas p
              WHERE p.lead_id = o.lead_id AND p.status <> 'cancelled')
           ), 0)::bigint AS lifetime_toman
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.deleted_at IS NULL AND u.role = 'customer'
    GROUP BY u.id, u.name, u.mobile
    HAVING max(o.placed_at) < now() - ${sinceDays}::int * interval '1 day'
    ORDER BY lifetime_toman DESC, last_order_at ASC
    LIMIT ${limit}::int
  `);
  const now = Date.now();
  return r.map((x) => {
    const last = new Date(String(x.last_order_at));
    return {
      userId: String(x.user_id),
      name: (x.name as string | null) ?? null,
      mobile: String(x.mobile),
      lastOrderAt: last.toISOString(),
      daysSince: Math.floor((now - last.getTime()) / DAY_MS),
      ordersTotal: Number(x.orders_total),
      lifetimeToman: Number(x.lifetime_toman ?? 0),
    };
  });
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
  //
  // `size` comes from its OWN per-cohort aggregate (`sizes`), never from the
  // grouped rows: with `GROUP BY m0, period`, a non-null period group only
  // contains users retained in THAT period, so `count(DISTINCT c.user_id)`
  // silently equalled `retained` rather than the cohort total, and the JS
  // pivot below kept whichever group Postgres happened to emit last (row
  // order was never specified). Measured on production: a real 8-user cohort
  // emitted size=1 and size=7 on separate rows and never 8 — so every
  // percentage in the heatmap was wrong, non-deterministically, and a cohort
  // whose retained-group landed last would render 1/1 = 100٪.
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
    ),
    sizes AS (
      SELECT m0, count(*)::int AS size FROM cohort GROUP BY m0
    )
    SELECT to_char(c.m0, 'YYYY-MM') AS cohort,
           extract(epoch FROM c.m0)::bigint AS m0_epoch,
           s.size,
           r.period,
           count(DISTINCT r.user_id)::int AS retained
    FROM cohort c
    JOIN sizes s ON s.m0 = c.m0
    LEFT JOIN retained r ON r.user_id = c.user_id AND r.period BETWEEN 0 AND ${months - 1}
    GROUP BY c.m0, s.size, r.period
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
  failing: SeoArticleCheck[]; // published articles failing ≥1 check (worst first), capped — see failingTotal
  /** The true count before the `failing` list is capped to 30 — without
   *  this the UI had no way to tell "showing everything" from "showing 30 of
   *  200 and silently hiding the rest." */
  failingTotal: number;
  /** Static architecture facts, not a live per-request check — see the
   *  `automated` block's own doc comment below for why. */
  automated: Array<{ label: string; ok: true }>;
}

export async function seoStats(): Promise<SeoStats> {
  const [arts, counts, lastPub] = await Promise.all([
    rows(sql`SELECT id, slug, title, type, excerpt, body_md AS "bodyMd" FROM articles WHERE status = 'published'`),
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
    checkArticleSeo(a as { id: string; slug: string; title: string; type: 'blog' | 'news'; excerpt: string | null; bodyMd: string }),
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

  const failingSorted = checks
    .filter((x) => !x.titleOk || !x.excerptOk || !x.thinOk)
    .sort((a, b) => Number(a.thinOk) - Number(b.thinOk) || a.words - b.words);

  return {
    score: computeSeoScore({ titlePassRate, excerptPassRate, thinPassRate, publishedLast30, daysSinceLastPublish }),
    published: Number(c.published ?? 0),
    drafts: Number(c.drafts ?? 0),
    publishedLast30,
    daysSinceLastPublish,
    titlePassRate: Math.round(titlePassRate * 100),
    excerptPassRate: Math.round(excerptPassRate * 100),
    thinPassRate: Math.round(thinPassRate * 100),
    failing: failingSorted.slice(0, 30),
    failingTotal: failingSorted.length,
    // NOT a live check — these are architecture facts about how this app is
    // built (true as of this writing, verified by reading the actual
    // sitemap/JSON-LD/ISR code), not something recomputed per request. A
    // future regression in any of these would keep showing ✓ here forever;
    // the UI copy says so explicitly rather than claiming "enforced".
    automated: [
      { label: 'نقشهٔ سایت (sitemap.xml) خودکار از دیتابیس تولید می‌شود', ok: true },
      { label: 'دادهٔ ساخت‌یافتهٔ Product/Offer برای همهٔ صفحات محصول', ok: true },
      { label: 'دادهٔ ساخت‌یافتهٔ NewsArticle برای مقاله‌ها', ok: true },
      { label: 'صفحات دسته/محصول ISR با متا و canonical', ok: true },
    ],
  };
}

/* ------------------------------ dashboard ------------------------------ */

/** Allowed lookback windows for the management dashboard (days). */
export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardStats {
  range: DashboardRange;
  /** Money + volume headline, current window vs the SAME-LENGTH prior one. */
  revenue: { current: number; prior: number; deltaPct: number | null; count: number; avgDeal: number };
  leads: { current: number; prior: number; deltaPct: number | null };
  orders: { current: number; prior: number; deltaPct: number | null };
  /** Of leads CREATED in the window, share that reached an order (entry cohort). */
  conversion: { current: number | null; prior: number | null; deltaPts: number | null };
  /** Daily proforma value + count — the combo chart's spine. */
  trend: Array<{ day: string; value: number; count: number }>;
  /** Entry-cohort funnel over the window. */
  funnel: { conversations: number; leads: number; proformas: number; orders: number };
  /** Per acquisition channel, quality-first (won-rate, not just volume). */
  bySource: Array<{ source: string; leads: number; won: number; wonRate: number | null }>;
  /** Live pipeline composition — ALL open leads, not just this window's. */
  leadStatus: Array<{ status: string; n: number }>;
  /** Open orders by shipment stage (operational, live). */
  orderStatus: Array<{ status: string; n: number }>;
  /** Best sellers by proforma value in the window (from the frozen line snapshot). */
  topProducts: Array<{ name: string; qty: number; value: number }>;
  /** Sales-desk leaderboard for the window. */
  team: Array<{ id: string; name: string; leads: number; won: number; wonRate: number | null; value: number }>;
  /** Needs-attention counters that are NOT time-windowed. */
  health: { stalePrices: number; smsFailed24h: number; expiringProformas: number; unassignedLeads: number };
}

/** Sum of proforma `total` in [now−daysBack, now−daysBack+len) full days. */
async function proformaValue(daysBack: number, len: number): Promise<{ sum: number; n: number }> {
  const end = new Date(todayMidnight().getTime() - (daysBack - len) * DAY_MS);
  const start = new Date(todayMidnight().getTime() - daysBack * DAY_MS);
  const r = await rows(sql`
    SELECT coalesce(sum(total), 0)::bigint AS sum, count(*)::int AS n FROM proformas
    WHERE created_at >= ${start.toISOString()}::timestamptz AND created_at < ${end.toISOString()}::timestamptz
  `);
  return { sum: Number(r[0]?.sum ?? 0), n: Number(r[0]?.n ?? 0) };
}

/** Lead→order conversion for the cohort of leads created in a window. */
async function cohortConversion(daysBack: number, len: number): Promise<number | null> {
  const end = new Date(todayMidnight().getTime() - (daysBack - len) * DAY_MS);
  const start = new Date(todayMidnight().getTime() - daysBack * DAY_MS);
  // Fan-out free: the LEFT JOIN inflated the `leads` DENOMINATOR by each
  // lead's order count, so this KPI (and its period-over-period delta)
  // systematically UNDER-reported conversion — the one direction nobody
  // questions, which is exactly why it survived.
  const r = await rows(sql`
    SELECT count(*)::int AS leads,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM orders o WHERE o.lead_id = l.id AND o.deleted_at IS NULL
           ))::int AS converted
    FROM leads l
    WHERE l.created_at >= ${start.toISOString()}::timestamptz
      AND l.created_at < ${end.toISOString()}::timestamptz
      AND l.deleted_at IS NULL
  `);
  const leads = Number(r[0]?.leads ?? 0);
  if (leads === 0) return null;
  return Math.round((Number(r[0]?.converted ?? 0) / leads) * 1000) / 10;
}

/**
 * Everything the management dashboard renders, in ONE round trip.
 *
 * Window semantics match the rest of this file: the "current" window is the
 * last `days` COMPLETE days (today excluded from comparisons so a half-done
 * day never reads as a collapse), compared against the same-length window
 * immediately before it. `trend` is the exception — it includes today as its
 * last point, which the chart marks as in-progress.
 *
 * Conversion is compared in PERCENTAGE POINTS (deltaPts), not as a percent of
 * a percent: "۱۲٪ → ۱۵٪" is +۳ points, and reporting that as "+۲۵٪ رشد" is the
 * classic dashboard lie.
 */
export async function dashboardStats(range: DashboardRange): Promise<DashboardStats> {
  const d = range;
  const startIso = new Date(todayMidnight().getTime() - d * DAY_MS).toISOString();
  const endIso = todayMidnight().toISOString();
  const trendStart = new Date(todayMidnight().getTime() - (d - 1) * DAY_MS).toISOString();

  const [
    valCur, valPrior,
    leadsCur, leadsPrior,
    ordersCur, ordersPrior,
    convCur, convPrior,
    trendRows, funnelConv, funnelRest,
    bySource, leadStatus, orderStatus, topProducts, team,
    stale, smsFailed, expiring, unassigned,
  ] = await Promise.all([
    proformaValue(d, d),
    proformaValue(d * 2, d),
    windowCount('leads', d, d),
    windowCount('leads', d * 2, d),
    windowCount('orders', d, d),
    windowCount('orders', d * 2, d),
    cohortConversion(d, d),
    cohortConversion(d * 2, d),
    rows(sql`
      SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
             coalesce(sum(p.total), 0)::bigint AS value,
             count(p.*)::int AS count
      FROM generate_series(${trendStart}::timestamptz, now(), '1 day') AS g(day)
      LEFT JOIN proformas p ON p.created_at >= g.day AND p.created_at < g.day + interval '1 day'
      GROUP BY g.day ORDER BY g.day
    `),
    rows(sql`
      SELECT count(*)::int AS n FROM ai_conversations
      WHERE created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
    `),
    // Fan-out free (see marketingStats' funnel for the full account) — this
    // is the SAME bug on the management dashboard's «قیف فروش», which
    // reported 10 leads against a true 2 on production.
    rows(sql`
      SELECT count(*)::int AS leads,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM proformas p WHERE p.lead_id = l.id))::int AS proformas,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.lead_id = l.id AND o.deleted_at IS NULL))::int AS orders
      FROM leads l
      WHERE l.created_at >= ${startIso}::timestamptz AND l.created_at < ${endIso}::timestamptz
        AND l.deleted_at IS NULL
    `),
    rows(sql`
      SELECT source,
             count(*)::int AS leads,
             count(*) FILTER (WHERE status = 'won')::int AS won
      FROM leads
      WHERE created_at >= ${startIso}::timestamptz AND created_at < ${endIso}::timestamptz
        AND deleted_at IS NULL
      GROUP BY source ORDER BY leads DESC
    `),
    // Pipeline composition is LIVE (every open lead), not window-scoped: a
    // manager asking "what's in the pipe right now" must not be shown only
    // the slice that happened to arrive this month.
    rows(sql`
      SELECT status, count(*)::int AS n FROM leads WHERE deleted_at IS NULL GROUP BY status
    `),
    rows(sql`
      SELECT status, count(*)::int AS n FROM orders
      WHERE deleted_at IS NULL AND status <> 'delivered' GROUP BY status
    `),
    rows(sql`
      SELECT li->>'name' AS name,
             sum((li->>'qty')::numeric)::float8 AS qty,
             coalesce(sum((li->>'lineTotal')::numeric), 0)::bigint AS value
      FROM proformas p, jsonb_array_elements(p.lines) AS li
      WHERE p.created_at >= ${startIso}::timestamptz AND p.created_at < ${endIso}::timestamptz
      GROUP BY li->>'name' ORDER BY value DESC NULLS LAST LIMIT 6
    `),
    rows(sql`
      SELECT u.id, coalesce(u.name, u.mobile) AS name,
             count(l.*)::int AS leads,
             count(l.*) FILTER (WHERE l.status = 'won')::int AS won,
             coalesce(sum(pf.total), 0)::bigint AS value
      FROM users u
      JOIN leads l ON l.assignee_id = u.id AND l.deleted_at IS NULL
        AND l.created_at >= ${startIso}::timestamptz AND l.created_at < ${endIso}::timestamptz
      LEFT JOIN LATERAL (
        SELECT sum(total) AS total FROM proformas WHERE lead_id = l.id
      ) pf ON true
      GROUP BY u.id, u.name, u.mobile ORDER BY value DESC, leads DESC LIMIT 8
    `),
    rows(sql`SELECT count(*)::int AS n FROM current_prices WHERE updated_at < now() - interval '24 hours'`),
    rows(sql`SELECT count(*)::int AS n FROM sms_log WHERE status = 'failed' AND at >= now() - interval '24 hours'`),
    rows(sql`
      SELECT count(*)::int AS n FROM proformas
      WHERE status = 'active' AND valid_until >= now() AND valid_until < now() + interval '3 days'
    `),
    rows(sql`
      SELECT count(*)::int AS n FROM leads
      WHERE deleted_at IS NULL AND assignee_id IS NULL AND status IN ('new', 'contacted')
    `),
  ]);

  const convDeltaPts =
    convCur === null || convPrior === null ? null : Math.round((convCur - convPrior) * 10) / 10;

  return {
    range,
    revenue: {
      current: valCur.sum,
      prior: valPrior.sum,
      deltaPct: pctDelta(valCur.sum, valPrior.sum),
      count: valCur.n,
      avgDeal: valCur.n > 0 ? Math.round(valCur.sum / valCur.n) : 0,
    },
    leads: { current: leadsCur, prior: leadsPrior, deltaPct: pctDelta(leadsCur, leadsPrior) },
    orders: { current: ordersCur, prior: ordersPrior, deltaPct: pctDelta(ordersCur, ordersPrior) },
    conversion: { current: convCur, prior: convPrior, deltaPts: convDeltaPts },
    trend: trendRows.map((r) => ({ day: String(r.day), value: Number(r.value), count: Number(r.count) })),
    funnel: {
      conversations: Number(funnelConv[0]?.n ?? 0),
      leads: Number(funnelRest[0]?.leads ?? 0),
      proformas: Number(funnelRest[0]?.proformas ?? 0),
      orders: Number(funnelRest[0]?.orders ?? 0),
    },
    bySource: bySource.map((r) => {
      const leads = Number(r.leads);
      const won = Number(r.won);
      return { source: String(r.source), leads, won, wonRate: leads > 0 ? Math.round((won / leads) * 1000) / 10 : null };
    }),
    leadStatus: leadStatus.map((r) => ({ status: String(r.status), n: Number(r.n) })),
    orderStatus: orderStatus.map((r) => ({ status: String(r.status), n: Number(r.n) })),
    topProducts: topProducts.map((r) => ({ name: String(r.name ?? '—'), qty: Number(r.qty ?? 0), value: Number(r.value ?? 0) })),
    team: team.map((r) => {
      const leads = Number(r.leads);
      const won = Number(r.won);
      return {
        id: String(r.id),
        name: String(r.name ?? '—'),
        leads,
        won,
        wonRate: leads > 0 ? Math.round((won / leads) * 1000) / 10 : null,
        value: Number(r.value ?? 0),
      };
    }),
    health: {
      stalePrices: Number(stale[0]?.n ?? 0),
      smsFailed24h: Number(smsFailed[0]?.n ?? 0),
      expiringProformas: Number(expiring[0]?.n ?? 0),
      unassignedLeads: Number(unassigned[0]?.n ?? 0),
    },
  };
}
