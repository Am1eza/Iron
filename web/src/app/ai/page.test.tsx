/**
 * /ai — the page around the advisor.
 *
 * Until now this route rendered nothing but the chat component: no h1, no
 * lede, no explanation of what the advisor knows (see
 * .claude/audits/ai-page-audit.md, "The page has no page"). These pin the
 * page framing that replaced it — and, just as importantly, that the widget
 * no longer carries the page's only h1 inside its own chrome bar.
 *
 * The capability copy is asserted against the REAL tool set in aiTools.ts:
 * per-factory comparison (compareFactories), exact section weight
 * (calcWeight) and guide-grounded answers (searchGuides). If a claim here
 * ever stops matching a tool that exists, this is the test that should fail.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AiPage from './page';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn(), confirmLead: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

async function renderPage() {
  const ui = await AiPage({ searchParams: Promise.resolve({}) });
  return render(ui);
}

/** House style (§6 + the system prompt's own rule 19): Persian guillemets,
 *  never the em-dash, never ASCII quotes, never a stray CJK character. */
const FORBIDDEN = /[—""'']|[一-鿿぀-ヿ]/;

describe('/ai — the page around the advisor', () => {
  it('has exactly one h1, and it is the page heading rather than the widget chrome', async () => {
    const { container } = await renderPage();
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('مشاور هوشمند خرید آهن و فولاد');
    // The panel keeps its name for assistive tech without competing for the h1.
    expect(screen.getByRole('region', { name: 'مشاور هوشمند آهن‌تایم' })).toBeInTheDocument();
  });

  it('opens with a short lede that states what the advisor does', async () => {
    await renderPage();
    const lede = screen.getByText(/بر پایهٔ همان قیمت‌هایی جواب می‌دهد/);
    expect(lede.textContent).toContain('هیچ عددی از خودش نمی‌سازد');
    // Length is load-bearing, not style: at 375px a lede line is ~37px of the
    // one screen the visitor has before the composer, and the first version
    // ran to 345 characters (7 lines, 259px). Five lines is the ceiling.
    expect((lede.textContent ?? '').length).toBeLessThan(280);
  });

  it('still states the no-online-payment fact, in the strip below the chat', async () => {
    await renderPage();
    const section = screen.getByRole('region', {
      name: 'این مشاور چه کاری می‌کند که یک چت عمومی نمی‌کند؟',
    });
    expect(section.textContent).toContain('پرداخت آنلاینی هم در کار نیست');
    expect(section.textContent).toContain('کارشناس برای نهایی‌کردن قیمت و زمان تحویل تماس می‌گیرد');
  });

  it('describes the three capabilities that are real tools, and links to the pages behind them', async () => {
    await renderPage();
    const section = screen.getByRole('region', {
      name: 'این مشاور چه کاری می‌کند که یک چت عمومی نمی‌کند؟',
    });
    // compareFactories · calcWeight · searchGuides, in the buyer's words.
    expect(within(section).getByText(/مقایسهٔ کارخانه‌ها روی تناژ خودت/)).toBeInTheDocument();
    expect(within(section).getByText(/وزن دقیق مقطع/)).toBeInTheDocument();
    expect(within(section).getByText(/جواب فنی با منبع/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'وزن‌سنج' })).toHaveAttribute(
      'href',
      '/tools/weight',
    );
    expect(within(section).getByRole('link', { name: 'جدول‌های قیمت' })).toHaveAttribute(
      'href',
      '/prices',
    );
  });

  it('keeps the chat composer above the explanatory content in DOM order', async () => {
    const { container } = await renderPage();
    const composer = container.querySelector('#chat-input')!;
    const capabilities = container.querySelector('#advisor-can-title')!;
    expect(composer).toBeTruthy();
    expect(capabilities).toBeTruthy();
    // Node.DOCUMENT_POSITION_FOLLOWING — the explainer comes after the input,
    // so a visitor never has to scroll past it to reach the composer.
    expect(composer.compareDocumentPosition(capabilities) & 4).toBeTruthy();
  });

  it('publishes an FAQPage whose answers match the locked product decisions', async () => {
    const { container } = await renderPage();
    const scripts = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent ?? '{}') as { '@type'?: string; mainEntity?: unknown[] },
    );
    const faq = scripts.find((s) => s['@type'] === 'FAQPage');
    expect(faq).toBeTruthy();
    const entities = (faq!.mainEntity ?? []) as {
      name: string;
      acceptedAnswer: { text: string };
    }[];
    expect(entities.length).toBeGreaterThanOrEqual(4);
    const payment = entities.find((e) => e.name.includes('آنلاین پرداخت'));
    expect(payment?.acceptedAnswer.text).toContain('پرداخت آنلاین وجود ندارد');
    // No price/number promises frozen into prose that can silently go stale.
    for (const e of entities) expect(e.acceptedAnswer.text).not.toMatch(/تومان/);
  });

  it('writes every visible string in the house punctuation style', async () => {
    const { container } = await renderPage();
    // Visible copy only: JSON-LD is a JSON document, so its structural ASCII
    // quotes are correct there and say nothing about the prose.
    const visible = container.cloneNode(true) as HTMLElement;
    visible.querySelectorAll('script').forEach((s) => s.remove());
    expect(visible.textContent ?? '').not.toMatch(FORBIDDEN);
  });
});
