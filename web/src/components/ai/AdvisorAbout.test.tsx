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
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '@/test/renderWithIntl';
import { AdvisorAbout } from './AdvisorAbout';

// `AdvisorAbout` builds its own FAQ items from `useTranslations('ai.about.faq')`
// (see messages/fa.json) — no longer a prop, so these assertions read the
// real fa copy instead of a mock fixture.
const FAQ_QUESTIONS = [
  'مشاور هوشمند آهن‌تایم قیمت‌ها را از کجا می‌آورد؟',
  'برای خرید باید آنلاین پرداخت کرد؟',
];

describe('AdvisorAbout', () => {
  it('is closed on arrival, so it cannot push the chat down', () => {
    const { container } = render(<AdvisorAbout />);
    // Rendered by the server WITHOUT `open`: an open panel on first paint
    // would re-create the bug this replaced, in a different shape.
    expect(container.querySelector('details')).not.toHaveAttribute('open');
  });

  it('keeps every word in the DOM, closed or not — the SEO half of the trade', () => {
    render(<AdvisorAbout />);
    // The lede…
    expect(screen.getByText(/هیچ عددی از خودش نمی‌سازد/)).toBeInTheDocument();
    // …the capability strip…
    expect(
      screen.getByRole('region', { name: 'این مشاور چه کاری می‌کند که یک چت عمومی نمی‌کند؟' }),
    ).toBeInTheDocument();
    // …and the FAQ, which also feeds this page's FAQPage JSON-LD.
    for (const question of FAQ_QUESTIONS) expect(screen.getByText(question)).toBeInTheDocument();
  });

  it('opens on the summary, and says what is inside before you open it', async () => {
    render(<AdvisorAbout />);
    const summary = screen.getByText('این مشاور دقیقاً چه کار می‌کند؟');
    // The hint is the thing that makes a collapsed panel worth opening.
    expect(screen.getByText(/قیمت‌ها از کجا می‌آیند/)).toBeInTheDocument();

    await userEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
  });
});
