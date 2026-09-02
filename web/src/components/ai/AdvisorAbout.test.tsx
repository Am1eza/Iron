/**
 * The explainer, folded away under the chat.
 *
 * The point of this component is a trade: keep every word of the page's
 * topical body (this route is acquired through organic search and carries
 * FAQPage JSON-LD) while costing the chat nothing above the fold. So the two
 * things worth pinning are that the copy is all still in the DOM, and that it
 * is closed on arrival.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorAbout } from './AdvisorAbout';

const FAQ = [
  { question: 'مشاور هوشمند آهن‌تایم قیمت‌ها را از کجا می‌آورد؟', answer: 'از همان دیتابیس جدول‌های قیمت.' },
  { question: 'برای خرید باید آنلاین پرداخت کرد؟', answer: 'خیر. پرداخت آنلاین وجود ندارد.' },
];

describe('AdvisorAbout', () => {
  it('is closed on arrival, so it cannot push the chat down', () => {
    const { container } = render(<AdvisorAbout faqItems={FAQ} />);
    // Rendered by the server WITHOUT `open`: an open panel on first paint
    // would re-create the bug this replaced, in a different shape.
    expect(container.querySelector('details')).not.toHaveAttribute('open');
  });

  it('keeps every word in the DOM, closed or not — the SEO half of the trade', () => {
    render(<AdvisorAbout faqItems={FAQ} />);
    // The lede…
    expect(screen.getByText(/هیچ عددی از خودش نمی‌سازد/)).toBeInTheDocument();
    // …the capability strip…
    expect(
      screen.getByRole('region', { name: 'این مشاور چه کاری می‌کند که یک چت عمومی نمی‌کند؟' }),
    ).toBeInTheDocument();
    // …and the FAQ, which also feeds this page's FAQPage JSON-LD.
    for (const item of FAQ) expect(screen.getByText(item.question)).toBeInTheDocument();
  });

  it('opens on the summary, and says what is inside before you open it', async () => {
    render(<AdvisorAbout faqItems={FAQ} />);
    const summary = screen.getByText('این مشاور دقیقاً چه کار می‌کند؟');
    // The hint is the thing that makes a collapsed panel worth opening.
    expect(screen.getByText(/قیمت‌ها از کجا می‌آیند/)).toBeInTheDocument();

    await userEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
  });
});
