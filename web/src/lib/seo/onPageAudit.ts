/**
 * On-page SEO audit for an article (US-14.4) — the logic behind the
 * traffic-light checklist next to the editor.
 *
 * WHY THIS IS WRITTEN HERE AND NOT INSTALLED
 * ------------------------------------------
 * The obvious move is `yoastseo` from npm. It is **GPL-3.0**, and this is a
 * closed commercial codebase — importing (or vendoring) it would put the whole
 * app under a copyleft obligation. So the checks are written from scratch, and
 * deliberately with NO dependencies at all beyond the app's own Persian text
 * helper: this module runs on every keystroke in the editor, so it has to be
 * cheap, synchronous and free of anything that could pull a parser into the
 * client bundle.
 *
 * It is also written for PERSIAN first, which is the other reason an
 * off-the-shelf English analyser was never going to fit:
 *
 *  - Word boundaries. `\b` is an ASCII construct; against Persian it matches
 *    in all the wrong places. Every keyword test here tokenises BOTH sides and
 *    compares token sequences instead, so «آهن» does not report itself as
 *    found inside «آهنگ» — a substring search (what a naive implementation
 *    does) says it is, and would hand a writer a green light they did not earn.
 *  - ZWNJ (نیم‌فاصله) is INSIDE a word, not between two. «ورق‌های گالوانیزه»
 *    is «ورق گالوانیزه» plus a plural enclitic, and an early version of this
 *    file that treated ZWNJ as a word break split that enclitic off, so the
 *    keyword «ورق گالوانیزه» — which requires adjacency — matched nothing at
 *    all in an article entirely about it. ZWNJ is now word-internal and a
 *    light enclitic stemmer does the rest; the compound spelling «قیمت‌آهن»
 *    is recovered separately in `countSequence`.
 *  - Arabic ك/ي/ة, hamza carriers (أ/إ/آ/ؤ/ئ) and THREE digit sets. A keyword
 *    typed «تأمین» must match a body typed «تامین», and «ورق ۲ میل» must match
 *    «ورق 2 میل» — this is a steel site, the size IS the keyword. Nothing on
 *    screen would ever explain the mismatch.
 *
 * Every check returns a status AND a Persian sentence saying what to do about
 * it. A dot with no explanation is a scolding, not a tool.
 */
import { normalizePersian } from '@/lib/utils/persianText';
import type { BlockNode, InlineNode, RichDoc } from '@/lib/content/richDoc';

/* ------------------------------- contract ------------------------------- */

/**
 * `idle` is not a fourth colour — it means "this check has nothing to say
 * yet" (no focus keyword typed, body still nearly empty). It renders grey and
 * is excluded from the summary, because counting an unanswerable check as a
 * failure is how a writer learns to ignore the panel.
 */
export type SeoCheckStatus = 'good' | 'warn' | 'bad' | 'idle';

export type SeoCheckId =
  | 'focusKeyword'
  | 'titleLength'
  | 'descriptionLength'
  | 'keywordInTitle'
  | 'keywordInSlug'
  | 'keywordInFirstParagraph'
  | 'keywordInHeading'
  | 'keywordDensity'
  | 'paragraphLength'
  | 'passiveVoice'
  | 'linkCount'
  | 'imageAlt';

export interface SeoCheck {
  id: SeoCheckId;
  /** Short Persian name of the check, for the row label. */
  label: string;
  status: SeoCheckStatus;
  /** One Persian sentence: what is wrong and what to do. Never empty. */
  message: string;
}

export interface SeoAuditInput {
  /** The article's own title (the `<h1>`). */
  title: string;
  /** SEO title override; empty means "use `title`". */
  seoTitle: string;
  /** SEO description override; empty means "use `excerpt`". */
  seoDescription: string;
  excerpt: string;
  /** URL segment (Persian, hyphen-separated — see `articleSlugify`). */
  slug: string;
  focusKeyword: string;
  doc: RichDoc | null | undefined;
}

export interface SeoAuditResult {
  checks: SeoCheck[];
  /** Worst status among the non-`idle` checks — the panel's headline light. */
  overall: SeoCheckStatus;
  counts: { good: number; warn: number; bad: number; idle: number };
  /** Body word count, shown next to the headline (writers ask for it). */
  wordCount: number;
}

/* ----------------------------- thresholds ------------------------------- */

/**
 * Google truncates a result title at roughly 600 px, not at a character
 * count; 50–60 characters is the industry proxy for that and is what every
 * writer has already been told. The API caps `seo.title` at 70, so the "too
 * long" band is deliberately reachable but small.
 */
export const TITLE_IDEAL = { min: 50, max: 60 } as const;
export const TITLE_OK = { min: 40, max: 70 } as const;
/** Same story for the description: ~160 chars is the desktop snippet. */
export const DESC_IDEAL = { min: 120, max: 160 } as const;
export const DESC_OK = { min: 80, max: 180 } as const;
/** Keyword density, as a percentage of body words. */
export const DENSITY_IDEAL = { min: 0.5, max: 2.5 } as const;
export const DENSITY_OK = { min: 0.3, max: 3.5 } as const;
/** Below this the body is too short for density to mean anything. */
export const MIN_WORDS_FOR_DENSITY = 60;
/** Paragraph word counts that read as a wall of text. */
export const PARAGRAPH_WARN_WORDS = 120;
export const PARAGRAPH_BAD_WORDS = 200;
/** Share of sentences that look passive. */
export const PASSIVE_WARN_RATIO = 0.15;
export const PASSIVE_BAD_RATIO = 0.25;
/** Below this there aren't enough sentences for a ratio to be meaningful. */
export const MIN_SENTENCES_FOR_PASSIVE = 4;

/* --------------------------- text extraction ---------------------------- */

const ZWNJ_RE = /‌/g;

/** Inline runs → plain text. A hard break is a space, not a joined word. */
function inlineText(nodes: InlineNode[] | undefined): string {
  let out = '';
  for (const n of nodes ?? []) {
    if (n.type === 'text') out += n.text;
    else out += ' ';
  }
  return out;
}

/**
 * Link hrefs in one inline run.
 *
 * CONSECUTIVE text nodes carrying the same href are ONE link. Tiptap splits a
 * link's text node wherever another mark starts or stops — a bold word inside
 * a link is three text nodes, all three marked with the same href — and
 * counting each one made the panel report «۳ پیوند داخلی» for a single link.
 * A genuine second link to the same destination is still counted twice,
 * because it is separated by at least one unlinked node.
 */
function inlineHrefs(nodes: InlineNode[] | undefined, into: string[]): void {
  let previous: string | null = null;
  for (const n of nodes ?? []) {
    const href = n.type === 'text' ? (n.marks?.find((m) => m.type === 'link')?.attrs.href ?? null) : null;
    if (href && href !== previous) into.push(href);
    previous = href;
  }
}

/** What kind of text a chunk is. Only `paragraph` chunks are prose: the
 *  wall-of-text and passive-voice checks run on those alone, while word count
 *  and keyword density count everything a reader reads. */
export type BodyChunkKind = 'paragraph' | 'heading' | 'caption' | 'cell';

export interface BodyChunk {
  text: string;
  kind: BodyChunkKind;
}

export interface BodyStats {
  /** Every readable run of text in document order, tagged with its kind.
   *  Tokenised exactly once by the audit — see the note there on why the
   *  earlier shape forced the same text through the normaliser twice. */
  chunks: BodyChunk[];
  /** Every reader-visible paragraph, in order — including the ones inside
   *  list items and blockquotes, which are paragraphs to the reader too. */
  paragraphs: string[];
  headings: Array<{ level: 2 | 3; text: string }>;
  links: string[];
  images: Array<{ alt: string; decorative: boolean }>;
  /** Everything above, plus table cells — the full readable text. Table cells
   *  count towards word count and density (a reader reads them) but not
   *  towards the paragraph-length check (a cell is not a wall of text). */
  text: string;
}

/** Walk the document once and collect everything the checks need. */
export function collectBodyStats(doc: RichDoc | null | undefined): BodyStats {
  const stats: BodyStats = { chunks: [], paragraphs: [], headings: [], links: [], images: [], text: '' };
  const chunks = stats.chunks;

  const pushParagraph = (text: string) => {
    const t = text.trim();
    if (!t) return;
    stats.paragraphs.push(t);
    chunks.push({ text: t, kind: 'paragraph' });
  };

  const walk = (blocks: BlockNode[] | undefined): void => {
    for (const block of blocks ?? []) {
      switch (block.type) {
        case 'paragraph':
          inlineHrefs(block.content, stats.links);
          pushParagraph(inlineText(block.content));
          break;
        case 'heading': {
          inlineHrefs(block.content, stats.links);
          const text = inlineText(block.content).trim();
          if (text) {
            stats.headings.push({ level: block.attrs.level, text });
            chunks.push({ text, kind: 'heading' });
          }
          break;
        }
        case 'bulletList':
        case 'orderedList':
          for (const item of block.content ?? []) walk(item.content);
          break;
        case 'blockquote':
          walk(block.content);
          break;
        case 'image':
          stats.images.push({
            alt: (block.attrs.alt ?? '').trim(),
            decorative: block.attrs.decorative === true,
          });
          // A caption is prose a reader reads, so it counts towards the body
          // text — but it is not a paragraph for the wall-of-text check.
          if (block.attrs.caption) chunks.push({ text: block.attrs.caption, kind: 'caption' });
          break;
        case 'table':
          for (const row of block.content ?? []) {
            for (const cell of row.content ?? []) {
              for (const p of cell.content ?? []) {
                inlineHrefs(p.content, stats.links);
                const t = inlineText(p.content).trim();
                if (t) chunks.push({ text: t, kind: 'cell' });
              }
            }
          }
          break;
        default:
          // horizontalRule, chart — no prose a reader reads as body text.
          // (A chart's title/labels are data labels, not sentences; counting
          // them would inflate density against a body that has no prose.)
          break;
      }
    }
  };

  walk(doc?.content);
  stats.text = chunks.map((c) => c.text).join('\n');
  return stats;
}

/* ------------------------ normalisation & matching ---------------------- */

/**
 * Canonical form for KEYWORD MATCHING, on top of `normalizePersian` (which
 * already folds Arabic ك/ي/ة, strips tatweel and diacritics, and folds
 * Arabic-Indic digits).
 *
 * Three more folds are needed here that a stored-text normaliser has no
 * business doing, because each of them loses information that is fine to lose
 * when ASKING "is this the same word?" and not fine to lose when STORING:
 *
 *  - **Hamza carriers.** «تأمین» and «تامین» are the same word typed two ways
 *    and never match each other otherwise. Same for آ/أ/إ → ا.
 *  - **ASCII digits.** This is a steel site: the size IS the keyword. «ورق ۲
 *    میل» typed with Persian digits must match «ورق 2 میل» typed on a laptop
 *    keyboard.
 *  - **ZWNJ inside a word is NOT a word break.** This one is the whole game.
 *    An earlier version folded ZWNJ to a SPACE so «قیمت‌آهن» would tokenise
 *    like «قیمت آهن» — and in doing so split every Persian enclitic off its
 *    stem, so «ورق‌های گالوانیزه» became [ورق][های][گالوانیزه] and the keyword
 *    «ورق گالوانیزه» (which requires adjacency) matched NOTHING. An article
 *    entirely about its own keyword scored red. Enclitics are far more common
 *    in Persian prose than ZWNJ-joined compounds, so ZWNJ is now word-internal
 *    and simply removed; the compound case is recovered separately, in
 *    `countSequence`, which also accepts the keyword's words written joined.
 */
const HAMZA_FOLD: Array<[RegExp, string]> = [
  [/[آأإٱ]/g, 'ا'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ی'],
  [/ء/g, ''],
];

function foldWord(word: string): string {
  let w = word.replace(ZWNJ_RE, '');
  for (const [re, to] of HAMZA_FOLD) w = w.replace(re, to);
  // ASCII 0-9 → Persian ۰-۹, mirroring what `normalizeSizeText` already does
  // for catalog sizes. `normalizePersian` only covers the Arabic-Indic set.
  return w.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x06f0 - 0x30));
}

/**
 * Persian enclitics, stripped so «ورق‌ها»، «ورق‌های» and «ورق» are one word to
 * the matcher. Longest first — «هایی» must win over «های» over «ها».
 *
 * A suffix is only removed when at least three letters survive it, which is
 * what keeps «دفتر» from becoming «دف» and «نشان» from becoming «ن». That
 * guard also means the stemmer under-strips short words (بهتر → بهتر), which
 * is the safe direction: an unstripped word simply fails to match its own
 * inflection, while an over-stripped one matches things it shouldn't.
 */
const ENCLITICS = ['هایی', 'های', 'ها', 'ترین', 'تر', 'مان', 'تان', 'شان', 'ام', 'ات', 'اش'];
const MIN_STEM = 3;

function stripEnclitic(word: string): string {
  for (const suffix of ENCLITICS) {
    if (word.length > suffix.length && word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Kept as a named export because the tests pin its behaviour directly. */
export function normalizeForMatch(input: string): string {
  return normalizePersian(input).toLowerCase();
}

/**
 * Words, for every count and every keyword test.
 *
 * Splitting on "not a letter, not a digit, not a ZWNJ" (Unicode-aware) drops
 * Persian punctuation, «»-quotes, hyphens and the slug's own separators
 * without listing them — and gives real word boundaries for a script `\b`
 * cannot see. ZWNJ is excluded from the separator class on purpose (see
 * `normalizeForMatch` above): it lives inside a word, so counting it as a
 * break both broke keyword matching and inflated the word count by one per
 * «می‌شود» in the article.
 */
export function tokenize(input: string): string[] {
  const normalized = normalizeForMatch(input);
  if (!normalized) return [];
  const out: string[] = [];
  for (const raw of normalized.split(/[^\p{L}\p{N}‌]+/u)) {
    const folded = foldWord(raw);
    if (folded) out.push(stripEnclitic(folded));
  }
  return out;
}

/**
 * Non-overlapping occurrences of a token sequence inside another.
 *
 * The ZWNJ-compound case is handled in BOTH directions, because a writer may
 * type the compound on either side. «قیمت‌آهن» is one token («قیمتاهن») and
 * «قیمت آهن» is two, and they are the same phrase:
 *
 *  - a multi-word keyword also matches a single haystack token equal to its
 *    words written together;
 *  - a single-word keyword also matches a RUN of consecutive haystack tokens
 *    whose concatenation equals it.
 *
 * The run is capped at `MAX_JOIN_SPAN` tokens: without a cap this is a
 * subset-sum scan over the whole document, and no real Persian compound is
 * built from more than a handful of parts.
 */
const MAX_JOIN_SPAN = 4;

export function countSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || haystack.length === 0) return 0;
  const joined = needle.length > 1 ? needle.join('') : null;
  let count = 0;
  for (let i = 0; i < haystack.length; ) {
    if (joined !== null && haystack[i] === joined) {
      count += 1;
      i += 1;
      continue;
    }
    if (needle.length === 1) {
      let span = 0;
      let acc = '';
      for (let k = 0; k < MAX_JOIN_SPAN && i + k < haystack.length; k += 1) {
        acc += haystack[i + k];
        if (acc === needle[0]) {
          span = k + 1;
          break;
        }
        // Once the accumulator is no longer a prefix of the target there is
        // nothing longer that can match either — stop rather than keep adding.
        if (!needle[0]!.startsWith(acc)) break;
      }
      if (span > 0) {
        count += 1;
        i += span;
        continue;
      }
    }
    let hit = i + needle.length <= haystack.length;
    for (let j = 0; hit && j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) hit = false;
    }
    if (hit) {
      count += 1;
      i += needle.length; // non-overlapping: «آهن آهن آهن» has one «آهن آهن»
    } else {
      i += 1;
    }
  }
  return count;
}

/** Does `text` contain the keyword as a whole word sequence? */
export function containsKeyword(text: string, keywordTokens: string[]): boolean {
  return countSequence(tokenize(text), keywordTokens) > 0;
}

/* --------------------------- Persian passives --------------------------- */

/**
 * Persian passive = X + a form of «شدن», where X is one of two things:
 *
 *  1. A past participle, which always ends in ه — «نوشته شد»، «ساخته می‌شود»،
 *     «فرستاده شده است». This is the textbook form and the one that makes a
 *     cheap detector possible at all.
 *  2. The verbal noun of a compound verb — «بررسی شد»، «انجام می‌شود»،
 *     «اعلام شده است». These do NOT end in ه, and leaving them out (the first
 *     version of this function did) misses most of the passives that actually
 *     appear in Persian business writing, where compound verbs dominate. They
 *     cannot be recognised morphologically, so a bounded list of the ones a
 *     steel-market article really uses is the honest trade: high precision,
 *     deliberately incomplete recall.
 *
 * This is a HEURISTIC and the UI says «احتمالاً» because of it. Two limits are
 * accepted rather than engineered around:
 *
 *  - «آماده شد» / «خسته شده» are inchoative («became ready»), not passive.
 *    The handful of adjectives common enough to matter are excluded below;
 *    the long tail is not worth a morphological analyser for a writing hint.
 *  - First/second-person forms (شدم، شدی، می‌شوم) are simply absent from the
 *    auxiliary list — an article is written in the third person, and their
 *    absence also keeps «شد» from matching the «شدم» inside it.
 */
const NON_PARTICIPLES = new Set([
  'آماده',
  'خسته',
  'زنده',
  'ساده',
  'تازه',
  'گرسنه',
  'تشنه',
  'دیوانه',
  'بیهوده',
  'همه',
]);

/**
 * Verbal nouns that form a compound verb with «کردن» in the active voice and
 * with «شدن» in the passive — «قیمت را اعلام کردیم» / «قیمت اعلام شد». Chosen
 * from what this site's own articles are about (prices, orders, delivery,
 * production), not from a general Persian corpus; a word not on this list is
 * simply not detected, which is the safe direction to be wrong in.
 */
const COMPOUND_PASSIVE_NOUNS = new Set([
  'انجام',
  'بررسی',
  'اعلام',
  'ثبت',
  'ارسال',
  'تایید',
  // `normalizePersian` folds ك/ي but not the hamza forms, so the two common
  // spellings of this word are two different strings here.
  'تأیید',
  'منتشر',
  'حذف',
  'اضافه',
  'تولید',
  'صادر',
  'وارد',
  'محاسبه',
  'پرداخت',
  'ارائه',
  'استفاده',
  'معرفی',
  'برگزار',
  'تعیین',
  'اصلاح',
  'طراحی',
  'نصب',
  'تحویل',
  'بارگیری',
  'عرضه',
  'توزیع',
]);

/**
 * Third-person «شدن» auxiliaries, longest-first so the alternation cannot
 * settle for a shorter prefix («شده» before «شده است» would).
 *
 * ZWNJ is normalised to a SPACE for this scan (`normalizeForGrammar`), which
 * is the opposite of what keyword matching does and is correct for both: the
 * things ZWNJ joins here are a verb's own prefix («می‌شود») and a participle
 * to its auxiliary («نوشته‌شده است»), so spacing them yields exactly the
 * multi-word forms listed below. The no-ZWNJ spellings («میشود», typed with a
 * plain full space or none at all) are listed too, because writers produce
 * both.
 *
 * The negated forms are here on purpose: «سفارش ثبت نشده است» is every bit as
 * passive as «ثبت شده است», and leaving them out made a whole register of
 * cautious, negative prose invisible to the check.
 */
const AUX_SOURCE = [
  'شدهاند',
  'نشدهاند',
  'نشده است',
  'نشده بود',
  'نمیشوند',
  'نمی شوند',
  'نمیشود',
  'نمی شود',
  'نمیشد',
  'نمی شد',
  'نخواهد شد',
  'نخواهند شد',
  'نشدند',
  'نشوند',
  'نشده',
  'نشود',
  'نشد',
  'شده است',
  'شده بود',
  'شده بودند',
  'میشوند',
  'می شوند',
  'میشود',
  'می شود',
  'میشدند',
  'می شدند',
  'میشد',
  'می شد',
  'خواهد شد',
  'خواهند شد',
  'میگردند',
  'می گردند',
  'میگردد',
  'می گردد',
  'گردیده است',
  'گردیدهاند',
  'گردیدند',
  'گردیده',
  'گردید',
  'شدند',
  'شوند',
  'شده',
  'شود',
  'شد',
].join('|');

const PERSIAN_LETTER = '\\u0600-\\u06FF';
const PASSIVE_RE = new RegExp(
  // A whole Persian word + space + auxiliary, with the auxiliary not glued to
  // a longer word («شد» must not fire inside «شدم»). Whether the captured word
  // actually licenses a passive reading is decided in `looksPassive` — the two
  // admissible shapes (participle / compound verbal noun) are a set membership
  // test, not something to encode in a regex.
  `(?:^|[^${PERSIAN_LETTER}])([${PERSIAN_LETTER}]{2,})\\s+(?:${AUX_SOURCE})(?![${PERSIAN_LETTER}])`,
  'g',
);

/** Sentence-ish units. Persian uses «.» and «؟» like English, plus «؛»; a
 *  newline ends a sentence too, because a paragraph break always does. */
export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?؟…؛\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Normalisation for the passive scan: ZWNJ becomes a SPACE.
 *
 * Removing it instead (what this did first) glued «نوشته‌شده است» into
 * «نوشتهشده است», and the pattern requires whitespace between the participle
 * and its auxiliary — so the typographically CORRECT spelling of a passive
 * was the one spelling the detector could not see. Spacing yields
 * «نوشته شده است» and «می شود», both of which the auxiliary list carries.
 */
function normalizeForGrammar(input: string): string {
  return normalizePersian(input.replace(ZWNJ_RE, ' '));
}

/** Does this word, immediately before a «شدن» auxiliary, make the pair a
 *  passive? See the two shapes documented above `NON_PARTICIPLES`. */
function licensesPassive(word: string): boolean {
  if (COMPOUND_PASSIVE_NOUNS.has(word)) return true;
  return word.endsWith('ه') && !NON_PARTICIPLES.has(word);
}

export function looksPassive(sentence: string): boolean {
  const s = normalizeForGrammar(sentence);
  PASSIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PASSIVE_RE.exec(s)) !== null) {
    if (licensesPassive(m[1]!)) return true;
    // The leading `(?:^|[^…])` consumed the character before the word, so a
    // rejected match must not eat the next candidate's separator.
    PASSIVE_RE.lastIndex = Math.max(PASSIVE_RE.lastIndex - 1, m.index + 1);
  }
  return false;
}

export function countPassiveSentences(sentences: string[]): number {
  let n = 0;
  for (const s of sentences) if (looksPassive(s)) n += 1;
  return n;
}

/* -------------------------------- helpers -------------------------------- */

/** Visible length in code points — `''.length` counts UTF-16 units, which is
 *  the wrong number for anything outside the BMP a writer might paste in. */
function charLength(s: string): number {
  return [...s.trim()].length;
}

const fa = new Intl.NumberFormat('fa-IR');
function num(n: number): string {
  return fa.format(n);
}
/** One decimal place, Persian digits — for the density percentage. */
function pct(n: number): string {
  return new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

function isInternalLink(href: string): boolean {
  return !/^https?:\/\//i.test(href) && !/^(mailto:|tel:)/i.test(href);
}

/* --------------------------------- audit -------------------------------- */

const KEYWORD_REQUIRED = 'ابتدا «کلیدواژهٔ هدف» را وارد کنید تا این مورد بررسی شود.';

/**
 * Run every check. Pure and synchronous: the editor calls this on each
 * keystroke (behind a `useMemo`), so it must never touch the network, the
 * DOM, or the clock.
 */
export function auditArticleSeo(input: SeoAuditInput): SeoAuditResult {
  const checks: SeoCheck[] = [];
  const push = (id: SeoCheckId, label: string, status: SeoCheckStatus, message: string) =>
    checks.push({ id, label, status, message });

  const keyword = input.focusKeyword.trim();
  const keywordTokens = tokenize(keyword);
  const hasKeyword = keywordTokens.length > 0;

  /**
   * ONE tokenisation pass over the document, reused by every check below.
   *
   * The first version tokenised `body.text` for the word count and density,
   * then tokenised every paragraph AGAIN for the wall-of-text check, then ran
   * a second normaliser over the whole text for the passive scan — three
   * full passes of seven regexes each, on every keystroke. Measured at ~50 ms
   * on a 100 kB article, which blows the 16 ms frame budget on its own.
   */
  const body = collectBodyStats(input.doc);
  const chunkTokens = body.chunks.map((c) => tokenize(c.text));
  const bodyTokens = chunkTokens.flat();
  const wordCount = bodyTokens.length;
  const paragraphWordCounts = chunkTokens.filter((_, i) => body.chunks[i]!.kind === 'paragraph').map((t) => t.length);

  /* 1 — the keyword itself */
  push(
    'focusKeyword',
    'کلیدواژهٔ هدف',
    hasKeyword ? 'good' : 'bad',
    hasKeyword
      ? `کلیدواژهٔ هدف: «${keyword}». بقیهٔ بررسی‌ها بر همین عبارت انجام می‌شود.`
      : 'عبارتی که می‌خواهید این مقاله با آن در گوگل دیده شود را وارد کنید — بدون آن هیچ بررسی کلیدواژه‌ای ممکن نیست.',
  );

  /* 2 — SERP title length */
  const serpTitle = (input.seoTitle.trim() || input.title.trim()).trim();
  const titleLen = charLength(serpTitle);
  if (titleLen === 0) {
    push('titleLength', 'طول عنوان', 'bad', 'عنوانی برای این مقاله ثبت نشده است.');
  } else if (titleLen >= TITLE_IDEAL.min && titleLen <= TITLE_IDEAL.max) {
    push('titleLength', 'طول عنوان', 'good', `طول عنوان ${num(titleLen)} نویسه است — در بازهٔ مطلوب.`);
  } else if (titleLen >= TITLE_OK.min && titleLen <= TITLE_OK.max) {
    push(
      'titleLength',
      'طول عنوان',
      'warn',
      titleLen < TITLE_IDEAL.min
        ? `عنوان ${num(titleLen)} نویسه است؛ کمی بلندترش کنید (${num(TITLE_IDEAL.min)} تا ${num(TITLE_IDEAL.max)} نویسه بهترین است).`
        : `عنوان ${num(titleLen)} نویسه است؛ کمی کوتاه‌ترش کنید (${num(TITLE_IDEAL.min)} تا ${num(TITLE_IDEAL.max)} نویسه بهترین است).`,
    );
  } else {
    push(
      'titleLength',
      'طول عنوان',
      'bad',
      titleLen < TITLE_OK.min
        ? `عنوان با ${num(titleLen)} نویسه خیلی کوتاه است؛ گوگل جای بیشتری می‌دهد — تا ${num(TITLE_IDEAL.max)} نویسه بنویسید.`
        : `عنوان با ${num(titleLen)} نویسه خیلی بلند است؛ گوگل انتهایش را با «…» می‌بُرد — تا ${num(TITLE_IDEAL.max)} نویسه کوتاهش کنید.`,
    );
  }

  /* 3 — meta description length */
  const serpDesc = (input.seoDescription.trim() || input.excerpt.trim()).trim();
  const descLen = charLength(serpDesc);
  if (descLen === 0) {
    push(
      'descriptionLength',
      'طول توضیح',
      'bad',
      'نه «توضیح در نتیجهٔ گوگل» پر شده و نه «خلاصه» — گوگل خودش تکه‌ای از متن را برمی‌دارد که معمولاً جذاب نیست.',
    );
  } else if (descLen >= DESC_IDEAL.min && descLen <= DESC_IDEAL.max) {
    push('descriptionLength', 'طول توضیح', 'good', `طول توضیح ${num(descLen)} نویسه است — در بازهٔ مطلوب.`);
  } else if (descLen >= DESC_OK.min && descLen <= DESC_OK.max) {
    push(
      'descriptionLength',
      'طول توضیح',
      'warn',
      descLen < DESC_IDEAL.min
        ? `توضیح ${num(descLen)} نویسه است؛ تا ${num(DESC_IDEAL.max)} نویسه فضا دارید — از آن استفاده کنید.`
        : `توضیح ${num(descLen)} نویسه است؛ کمی کوتاه‌ترش کنید (${num(DESC_IDEAL.min)} تا ${num(DESC_IDEAL.max)} نویسه بهترین است).`,
    );
  } else {
    push(
      'descriptionLength',
      'طول توضیح',
      'bad',
      descLen < DESC_OK.min
        ? `توضیح با ${num(descLen)} نویسه خیلی کوتاه است؛ یک جملهٔ کامل دربارهٔ محتوای صفحه بنویسید (${num(DESC_IDEAL.min)} تا ${num(DESC_IDEAL.max)} نویسه).`
        : `توضیح با ${num(descLen)} نویسه خیلی بلند است؛ گوگل انتهایش را نشان نمی‌دهد — تا ${num(DESC_IDEAL.max)} نویسه کوتاهش کنید.`,
    );
  }

  /* 4 — keyword in title */
  if (!hasKeyword) {
    push('keywordInTitle', 'کلیدواژه در عنوان', 'idle', KEYWORD_REQUIRED);
  } else if (containsKeyword(serpTitle, keywordTokens)) {
    push('keywordInTitle', 'کلیدواژه در عنوان', 'good', 'کلیدواژه در عنوان آمده است.');
  } else {
    push(
      'keywordInTitle',
      'کلیدواژه در عنوان',
      'bad',
      'کلیدواژه در عنوان نیامده — مهم‌ترین جایی است که گوگل و خواننده دنبالش می‌گردند؛ ترجیحاً نزدیک به ابتدای عنوان.',
    );
  }

  /* 5 — keyword in slug */
  if (!hasKeyword) {
    push('keywordInSlug', 'کلیدواژه در نشانی', 'idle', KEYWORD_REQUIRED);
  } else if (!input.slug.trim()) {
    push('keywordInSlug', 'کلیدواژه در نشانی', 'bad', 'نشانی صفحه هنوز ساخته نشده است.');
  } else if (containsKeyword(input.slug.replace(/-/g, ' '), keywordTokens)) {
    push('keywordInSlug', 'کلیدواژه در نشانی', 'good', 'کلیدواژه در نشانی صفحه آمده است.');
  } else {
    push(
      'keywordInSlug',
      'کلیدواژه در نشانی',
      'warn',
      'کلیدواژه در نشانی صفحه نیست. اگر مقاله هنوز منتشر نشده، نشانی را در «تنظیمات پیشرفته» اصلاح کنید؛ برای مقالهٔ منتشرشده تغییر نشانی ارزشش را ندارد.',
    );
  }

  /* 6 — keyword in the first paragraph.
     `paragraphs[0]` is the first PROSE block: if the article opens with a
     bullet list, that is its first bullet, which is the right thing to check
     — it is still the first thing a reader reads. */
  const firstParagraph = body.paragraphs[0] ?? '';
  if (!hasKeyword) {
    push('keywordInFirstParagraph', 'کلیدواژه در پاراگراف اول', 'idle', KEYWORD_REQUIRED);
  } else if (!firstParagraph) {
    push(
      'keywordInFirstParagraph',
      'کلیدواژه در پاراگراف اول',
      'idle',
      // NOT "the article is empty" — an article can be all headings, tables
      // and captions, which is a real (if unusual) steel-price post. Saying
      // "empty" about a page full of content is simply wrong.
      wordCount === 0 ? 'متن مقاله هنوز خالی است.' : 'متن مقاله هنوز پاراگرافی ندارد.',
    );
  } else if (containsKeyword(firstParagraph, keywordTokens)) {
    push('keywordInFirstParagraph', 'کلیدواژه در پاراگراف اول', 'good', 'کلیدواژه در پاراگراف اول آمده است.');
  } else {
    push(
      'keywordInFirstParagraph',
      'کلیدواژه در پاراگراف اول',
      'warn',
      'کلیدواژه در پاراگراف اول نیامده — خواننده و گوگل هر دو از همان چند خط اول تصمیم می‌گیرند این صفحه دربارهٔ چیست.',
    );
  }

  /* 7 — keyword in at least one H2/H3 */
  if (!hasKeyword) {
    push('keywordInHeading', 'کلیدواژه در تیترها', 'idle', KEYWORD_REQUIRED);
  } else if (body.headings.length === 0) {
    push(
      'keywordInHeading',
      'کلیدواژه در تیترها',
      'warn',
      'متن هیچ تیتر میانی ندارد. متن بلند بدون تیتر هم برای خواننده سخت است، هم برای گوگل.',
    );
  } else if (body.headings.some((h) => containsKeyword(h.text, keywordTokens))) {
    push('keywordInHeading', 'کلیدواژه در تیترها', 'good', 'دست‌کم یک تیتر میانی کلیدواژه را دارد.');
  } else {
    push(
      'keywordInHeading',
      'کلیدواژه در تیترها',
      'warn',
      `هیچ‌کدام از ${num(body.headings.length)} تیتر میانی کلیدواژه را ندارند؛ دست‌کم یکی را بازنویسی کنید.`,
    );
  }

  /* 8 — keyword density */
  if (!hasKeyword) {
    push('keywordDensity', 'تراکم کلیدواژه', 'idle', KEYWORD_REQUIRED);
  } else if (wordCount < MIN_WORDS_FOR_DENSITY) {
    push(
      'keywordDensity',
      'تراکم کلیدواژه',
      'idle',
      `متن هنوز ${num(wordCount)} کلمه است؛ از ${num(MIN_WORDS_FOR_DENSITY)} کلمه به بعد تراکم معنا پیدا می‌کند.`,
    );
  } else {
    const occurrences = countSequence(bodyTokens, keywordTokens);
    /**
     * OCCURRENCES over words, not words-belonging-to-the-phrase over words.
     *
     * The first version multiplied by the keyword's word count, which is a
     * defensible metric but was then graded against the industry thresholds
     * for the OTHER one. The result punished multi-word keywords for their
     * length: eight mentions of a three-word phrase in a 600-word article —
     * one mention per 75 words, which is sparse — scored 4 % and was called
     * «انباشت کلیدواژه». Counting mentions makes a single-word and a
     * three-word keyword comparable, which is what the bands assume.
     */
    const rawDensity = (occurrences * 100) / wordCount;
    // Grade the number the writer is SHOWN. Grading the unrounded value let
    // the panel display «۰٫۳٪» and in the same sentence call it below a floor
    // of 0.3 % — true of 0.2985, and indefensible on screen.
    const density = Math.round(rawDensity * 10) / 10;
    const shown = `${num(occurrences)} بار در ${num(wordCount)} کلمه (${pct(density)}٪)`;
    if (occurrences === 0) {
      push(
        'keywordDensity',
        'تراکم کلیدواژه',
        'bad',
        'کلیدواژه اصلاً در متن نیامده است. اگر مقاله دربارهٔ همین موضوع است، عبارت را طبیعی در متن به کار ببرید.',
      );
    } else if (density >= DENSITY_IDEAL.min && density <= DENSITY_IDEAL.max) {
      push('keywordDensity', 'تراکم کلیدواژه', 'good', `${shown} — در بازهٔ مطلوب.`);
    } else if (density >= DENSITY_OK.min && density <= DENSITY_OK.max) {
      push(
        'keywordDensity',
        'تراکم کلیدواژه',
        'warn',
        density < DENSITY_IDEAL.min
          ? `${shown} — کم است؛ چند جای دیگر که طبیعی است همین عبارت را به کار ببرید.`
          : `${shown} — کمی زیاد است؛ چند مورد را با هم‌معنی جایگزین کنید.`,
      );
    } else {
      push(
        'keywordDensity',
        'تراکم کلیدواژه',
        'bad',
        density < DENSITY_OK.min
          ? `${shown} — خیلی کم است؛ گوگل موضوع صفحه را از تکرار طبیعی عبارت می‌فهمد.`
          : `${shown} — بیش از حد تکرار شده و گوگل آن را «انباشت کلیدواژه» می‌بیند؛ تعدادش را کم کنید.`,
      );
    }
  }

  /* 9 — paragraph length. Counts come from the single tokenisation pass. */
  const longParagraphs = paragraphWordCounts.filter((n) => n > PARAGRAPH_WARN_WORDS);
  const veryLong = longParagraphs.filter((n) => n > PARAGRAPH_BAD_WORDS).length;
  if (paragraphWordCounts.length === 0) {
    push(
      'paragraphLength',
      'طول پاراگراف‌ها',
      'idle',
      wordCount === 0 ? 'متن مقاله هنوز خالی است.' : 'متن مقاله پاراگرافی ندارد که طولش سنجیده شود.',
    );
  } else if (longParagraphs.length === 0) {
    push('paragraphLength', 'طول پاراگراف‌ها', 'good', 'هیچ پاراگرافی بیش از اندازه بلند نیست.');
  } else if (veryLong > 0) {
    push(
      'paragraphLength',
      'طول پاراگراف‌ها',
      'bad',
      `${num(veryLong)} پاراگراف بیش از ${num(PARAGRAPH_BAD_WORDS)} کلمه دارد. در موبایل دیوارِ متن می‌شود؛ آن را به چند پاراگراف کوتاه‌تر بشکنید.`,
    );
  } else {
    push(
      'paragraphLength',
      'طول پاراگراف‌ها',
      'warn',
      `${num(longParagraphs.length)} پاراگراف بیش از ${num(PARAGRAPH_WARN_WORDS)} کلمه دارد؛ شکستنشان خواندن را آسان‌تر می‌کند.`,
    );
  }

  /* 10 — Persian passive voice.
     PROSE ONLY. Running this over `body.text` counted every heading, image
     caption and table cell as a "sentence" (they are newline-separated, and a
     newline terminates a sentence), so a 6×5 table contributed thirty
     non-sentences to the denominator and a data-heavy article diluted its way
     to a green light it had not earned. */
  const sentences = splitSentences(body.paragraphs.join('\n'));
  if (sentences.length < MIN_SENTENCES_FOR_PASSIVE) {
    push('passiveVoice', 'جمله‌های مجهول', 'idle', 'متن هنوز برای این بررسی کوتاه است.');
  } else {
    const passive = countPassiveSentences(sentences);
    const ratio = passive / sentences.length;
    const shown = `${num(passive)} جمله از ${num(sentences.length)} جمله`;
    if (ratio <= PASSIVE_WARN_RATIO) {
      push('passiveVoice', 'جمله‌های مجهول', 'good', `${shown} احتمالاً مجهول است — مشکلی نیست.`);
    } else if (ratio <= PASSIVE_BAD_RATIO) {
      push(
        'passiveVoice',
        'جمله‌های مجهول',
        'warn',
        `${shown} احتمالاً مجهول است («… انجام شد»). جملهٔ معلوم («ما … را انجام دادیم») روان‌تر خوانده می‌شود.`,
      );
    } else {
      push(
        'passiveVoice',
        'جمله‌های مجهول',
        'bad',
        `${shown} احتمالاً مجهول است؛ متن اداری و سنگین می‌شود. تا حد ممکن فاعل جمله را مشخص کنید.`,
      );
    }
  }

  /* 11 — links */
  const internal = body.links.filter(isInternalLink).length;
  const external = body.links.length - internal;
  if (body.links.length === 0) {
    push(
      'linkCount',
      'پیوندهای متن',
      'warn',
      'متن هیچ پیوندی ندارد. دست‌کم یک پیوند به صفحهٔ مرتبط در همین سایت (مثلاً صفحهٔ قیمت همان محصول) بگذارید.',
    );
  } else if (internal === 0) {
    push(
      'linkCount',
      'پیوندهای متن',
      'warn',
      `${num(external)} پیوند بیرونی دارید و هیچ پیوند داخلی. دست‌کم یک پیوند به صفحهٔ مرتبط در همین سایت اضافه کنید.`,
    );
  } else {
    push(
      'linkCount',
      'پیوندهای متن',
      'good',
      external > 0
        ? `${num(internal)} پیوند داخلی و ${num(external)} پیوند بیرونی.`
        : `${num(internal)} پیوند داخلی.`,
    );
  }

  /* 12 — image alt coverage */
  const described = body.images.filter((im) => im.decorative || im.alt.length > 0).length;
  const missing = body.images.length - described;
  if (body.images.length === 0) {
    push('imageAlt', 'متن جایگزین تصویرها', 'idle', 'تصویری در متن مقاله نیست.');
  } else if (missing === 0) {
    push(
      'imageAlt',
      'متن جایگزین تصویرها',
      'good',
      `هر ${num(body.images.length)} تصویر متن جایگزین دارد (یا تزئینی علامت خورده است).`,
    );
  } else {
    push(
      'imageAlt',
      'متن جایگزین تصویرها',
      missing === body.images.length ? 'bad' : 'warn',
      `${num(missing)} تصویر از ${num(body.images.length)} تصویر متن جایگزین ندارد. روی تصویر در متن کلیک کنید و توضیحش را بنویسید.`,
    );
  }

  const counts = { good: 0, warn: 0, bad: 0, idle: 0 };
  for (const c of checks) counts[c.status] += 1;
  const overall: SeoCheckStatus =
    counts.bad > 0 ? 'bad' : counts.warn > 0 ? 'warn' : counts.good > 0 ? 'good' : 'idle';

  return { checks, overall, counts, wordCount };
}
