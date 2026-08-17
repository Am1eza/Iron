/**
 * Test helper: detect formal second-person-plural (شما) forms in Persian copy.
 *
 * The advisor speaks in تو (AI_SYSTEM_PROMPT rules 21-22, and the brand book's
 * «دوستِ کاربلد بازار»), so a شما form anywhere the advisor speaks is the bug
 * this catches — see lib/server/ai/register.test.ts and
 * components/ai/AdvisorChat.register.test.tsx.
 *
 * Written as explicit forms rather than a generic «…ید» suffix rule, which
 * would also flag ordinary words like «خرید», «تأیید», «جدید» and «کلید». The
 * Persian alphabet is invisible to `\b`, so word edges are asserted with a
 * letter lookaround instead.
 */
const FORMAL_MARKERS: [label: string, pattern: RegExp][] = [
  ['شما', /(?<!\p{L})شما(?!\p{L})/u],
  ['بفرمایید', /می‌فرمایید|بفرمایید/u],
  ['می‌کنید', /می‌کنید/u],
  ['کنید', /(?<!\p{L})کنید(?!\p{L})/u],
  ['می‌خواهید', /می‌خواهید|بخواهید/u],
  ['می‌توانید', /می‌توانید/u],
  ['دارید', /(?<!\p{L})دارید(?!\p{L})/u],
  ['هستید', /(?<!\p{L})هستید(?!\p{L})/u],
  ['بگیرید', /بگیرید/u],
  ['ببینید', /ببینید/u],
  ['بزنید', /بزنید/u],
  ['بدهید', /بدهید/u],
  ['شوید', /(?<!\p{L})شوید(?!\p{L})/u],
];

/** Every formal marker present in `text` — empty means the copy is in تو. */
export function formalMarkersIn(text: string): string[] {
  return FORMAL_MARKERS.filter(([, re]) => re.test(text)).map(([label]) => label);
}
