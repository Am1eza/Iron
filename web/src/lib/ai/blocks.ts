/**
 * Generative-UI blocks — the advisor's second output channel.
 *
 * WHY THIS EXISTS. The advisor could only ever answer in prose. Asked «قیمت
 * میلگرد چنده؟» it wrote a sentence, when what a real broker does is put the
 * options on the table: which size, which mill, and what everyone is quoting
 * side by side. Prose cannot do that — a markdown table is not tappable, a
 * list of factory names has to be retyped, and a price with no timestamp is a
 * claim rather than a quote.
 *
 * So a turn now carries TWO things: the model's words, and zero or more typed
 * blocks that the client renders as real components. The split is deliberate
 * and it is the whole safety story:
 *
 *   - The MODEL writes only the prose, and every number in that prose is still
 *     gated by the grounding validator exactly as before.
 *   - A BLOCK is built server-side, in code, from the same repo rows the
 *     price tables read. The model never authors a block, never edits one, and
 *     cannot put a number into one. It only decides WHICH TOOL to call.
 *
 * That means a block needs no censorship pass: there is no path by which a
 * number reaches it other than the database. It also means the prompt can tell
 * the model to stop repeating the data in prose — the card already said it,
 * and saying it twice is how the old answers got long and unreadable.
 *
 * Shared client/server on purpose (this file imports nothing server-only):
 * the SSE frame the route emits and the props the React component takes are
 * the same type, so a field added on one side fails to compile on the other.
 */
import type { MovementDir } from '@/lib/types/domain';

/** Every block kind the client can render. A frame with an unknown `kind` is
 *  dropped silently by the renderer — an older client must never crash on a
 *  newer server, and a half-rendered card is worse than no card. */
export type BlockKind =
  | 'options'
  | 'quote'
  | 'compare'
  | 'trend'
  | 'forecast'
  | 'expert';

/* ------------------------------------------------------------------ options */

/**
 * One tappable answer. `send` is what gets submitted as the visitor's next
 * message — NOT an id, and not a code. Tapping a chip and typing its label by
 * hand take the identical path through the tools, which is what makes the
 * chips safe: they are a keyboard shortcut, not a second protocol.
 */
export interface BlockOption {
  /** Chip label — the catalog's own words. */
  label: string;
  /** The message sent on tap. Defaults to `label` when omitted. */
  send?: string;
  /** Optional second line (e.g. «۴ کارخانه» or a price hint). */
  hint?: string;
}

export interface BlockOptionGroup {
  /** «سایز» · «گرید» · «کارخانه» */
  title: string;
  options: BlockOption[];
  /** True when the catalog had more options than the group shows. */
  truncated?: boolean;
}

/**
 * The clarifying question, as buttons. Replaces «کدام سایز را می‌خواهی؟» +
 * a numbered list the visitor has to read and retype.
 */
export interface OptionsBlock {
  kind: 'options';
  /** What the options belong to — «میلگرد آجدار». */
  subject: string;
  /** The question itself, one short Persian line. */
  question: string;
  groups: BlockOptionGroup[];
}

/* -------------------------------------------------------------------- quote */

/** One product's live price, with the timestamp that makes it a quote. */
export interface QuoteBlock {
  kind: 'quote';
  name: string;
  /** In-app product-page URL (built with `routes.sku`, never hand-written). */
  href?: string;
  factory?: string;
  size?: string;
  grade?: string;
  /** null ⇒ withheld/stale-hidden; the card shows «استعلام از کارشناس». */
  price: number | null;
  /** «تومان / کیلوگرم» — resolved from the row's own priceBasis. */
  unitLabel: string;
  movementPct?: number;
  movementDir?: MovementDir;
  deliveryTime?: string;
  /** ISO. Rendered as an exact Jalali date+time on every card (brief §8). */
  updatedAt: string;
  isStale: boolean;
  /** Inline sparkline, when this SKU has real history. */
  trend?: TrendSeries;
}

/* -------------------------------------------------------------------- trend */

export interface TrendSeries {
  /** Ascending daily closes. */
  values: number[];
  /** ISO timestamps aligned 1:1 with `values`. */
  dates: string[];
}

/** A standalone price-history card (the sparkline as its own answer). */
export interface TrendBlock extends TrendSeries {
  kind: 'trend';
  title: string;
  unitLabel: string;
  rangeLabel: string;
  /** Net change across the window, percent. Computed server-side. */
  changePct?: number;
  /** Deep link to the full chart on the product page. */
  href?: string;
}

/* ------------------------------------------------------------------ compare */

export interface CompareRow {
  factory: string;
  /** Toman per kilogram — the only fair basis (see bulkSplit.ts). */
  pricePerKg: number;
  /** Cost of the asked tonnage at this mill. Absent when no tonnage was given. */
  totalToman?: number;
  /** …plus freight/handling/insurance to the known city. */
  landedToman?: number;
  movementPct?: number;
  movementDir?: MovementDir;
  /** How many catalog rows this factory's average is over. 1 ⇒ single source. */
  rowCount: number;
  /** ISO — freshest price row behind this line. */
  updatedAt: string;
  /** Product page for this factory's row, when there is exactly one. */
  href?: string;
  cheapest?: boolean;
  /** Cheapest once freight is added — a different mill often wins here. */
  cheapestLanded?: boolean;
}

export interface CompareBlock {
  kind: 'compare';
  /** «میلگرد ۱۴ · آجدار» */
  title: string;
  /** «۲۰ تن» */
  subtitle?: string;
  rows: CompareRow[];
  tonnage?: number;
  /** Destination the landed column is computed for. */
  city?: string;
  /** Where the landed column ships FROM («انبار شادآباد تهران»). */
  originLabel?: string;
  /** Cheapest vs. runner-up, in Toman, over the asked tonnage. */
  savingsVsNextToman?: number;
  /** Rows the comparison could not price per kg (non-kg basis). */
  excludedNonKg?: number;
  /** ISO — freshest timestamp across every row. */
  updatedAt: string;
}

/* ----------------------------------------------------------------- forecast */

export type ForecastDirection = 'up' | 'down' | 'flat';
export type ForecastConfidence = 'low' | 'medium' | 'high';

/** One market driver's contribution to the directional call. */
export interface ForecastDriver {
  /** «دلار» · «شمش» · «طلای ۱۸ عیار» */
  label: string;
  /** The driver's own recent move, percent. */
  changePct: number;
  /** Pearson correlation with the product's own series, −1…1. */
  correlation: number;
}

/**
 * A DIRECTIONAL call — never a price for a date.
 *
 * The band is expressed in PERCENT, deliberately: a percentage band reads as
 * the estimate it is, while «۴۲٬۳۰۰ تومان در ۱۴ مهر» reads as a commitment
 * this data cannot support. See server/ai/forecast.ts for the arithmetic and
 * for why it refuses to answer at all below a minimum amount of history.
 */
export interface ForecastBlock {
  kind: 'forecast';
  title: string;
  direction: ForecastDirection;
  confidence: ForecastConfidence;
  /** Rough band over the horizon, percent (low ≤ high; may straddle zero). */
  bandLowPct: number;
  bandHighPct: number;
  /** «۱ تا ۲ هفتهٔ آینده» */
  horizonLabel: string;
  /** One Persian line explaining the call, assembled from real numbers. */
  reason: string;
  drivers: ForecastDriver[];
  /** Calendar days of product history the call is based on. */
  basedOnDays: number;
  /** The product's own move over that window, percent. */
  ownChangePct: number;
  /** ISO — last price update of the product itself. */
  updatedAt: string;
  /** Inline history so the reader sees what the call is reading. */
  trend?: TrendSeries;
}

/* ------------------------------------------------------------------- expert */

/** The human escape hatch. Emitted when a tool dead-ends; also rendered
 *  persistently by the chat shell, which is why the contact details are
 *  carried rather than hardcoded in the component. */
export interface ExpertBlock {
  kind: 'expert';
  /** Why the handoff — one short Persian line, never an apology loop. */
  reason: string;
  phone: string;
  mobile: string;
  whatsappUrl: string;
}

/* -------------------------------------------------------------------------- */

export type AdvisorBlock =
  | OptionsBlock
  | QuoteBlock
  | CompareBlock
  | TrendBlock
  | ForecastBlock
  | ExpertBlock;

const KINDS: ReadonlySet<string> = new Set<BlockKind>([
  'options',
  'quote',
  'compare',
  'trend',
  'forecast',
  'expert',
]);

/**
 * Wire guard for a `{type:'block'}` SSE frame.
 *
 * The client parses whatever the server sent; this is the one place that
 * decides a payload is renderable. It checks the discriminant only — the
 * fields are the server's own typed builders' output, not user input, and a
 * per-field validator here would be a second copy of the type that silently
 * rots. What it MUST do is reject an unknown kind, so a client that predates
 * a new block kind ignores it instead of rendering an empty box.
 */
export function isAdvisorBlock(value: unknown): value is AdvisorBlock {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && KINDS.has(kind);
}

/** What a chip actually sends when tapped. */
export function optionMessage(option: BlockOption): string {
  return (option.send ?? option.label).trim();
}
