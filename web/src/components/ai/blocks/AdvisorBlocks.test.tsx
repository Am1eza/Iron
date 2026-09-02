/**
 * The cards, as a visitor meets them.
 *
 * Three things are worth a component test rather than a builder test: that a
 * chip tap sends the words a human would have typed (the whole premise of the
 * picker), that a withheld price renders as a request for a quote and never as
 * a number, and that every price card shows its own «آخرین به‌روزرسانی» stamp —
 * the trust requirement that separates a quote from a claim.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorBlocks } from './AdvisorBlocks';
import type { AdvisorBlock } from '@/lib/ai/blocks';

const AT = '2026-08-01T09:30:00.000Z';

describe('AdvisorBlocks', () => {
  it('sends a chip’s own words as the next message, not an id', async () => {
    const onPick = vi.fn();
    const block: AdvisorBlock = {
      kind: 'options',
      subject: 'میلگرد',
      question: 'کدام سایز میلگرد را می‌خواهی؟',
      groups: [
        {
          title: 'سایز',
          options: [
            { label: '۱۴', send: 'قیمت میلگرد ۱۴' },
            { label: '۱۶', send: 'قیمت میلگرد ۱۶' },
          ],
        },
      ],
    };
    render(<AdvisorBlocks blocks={[block]} onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: '۱۴' }));
    expect(onPick).toHaveBeenCalledWith('قیمت میلگرد ۱۴');
  });

  it('renders the question as the option group’s legend', () => {
    const block: AdvisorBlock = {
      kind: 'options',
      subject: 'میلگرد',
      question: 'کدام سایز میلگرد را می‌خواهی؟',
      groups: [{ title: 'سایز', options: [{ label: '۱۴' }] }],
    };
    render(<AdvisorBlocks blocks={[block]} onPick={vi.fn()} />);
    expect(screen.getByRole('group', { name: /کدام سایز میلگرد/ })).toBeInTheDocument();
  });

  it('stamps a price card with the exact time its number was last updated', () => {
    const block: AdvisorBlock = {
      kind: 'quote',
      name: 'میلگرد ۱۴ ذوب‌آهن',
      price: 42_300,
      unitLabel: 'تومان / کیلوگرم',
      updatedAt: AT,
      isStale: false,
      movementDir: 'up',
      movementPct: 1.2,
    };
    const { container } = render(<AdvisorBlocks blocks={[block]} onPick={vi.fn()} />);
    const time = container.querySelector('time');
    expect(time).toHaveAttribute('dateTime', AT);
    expect(screen.getByText(/آخرین به‌روزرسانی/)).toBeInTheDocument();
  });

  it('asks for a quote instead of printing a number it does not have', () => {
    const block: AdvisorBlock = {
      kind: 'quote',
      name: 'ورق ۲ فولاد مبارکه',
      price: null,
      unitLabel: 'تومان / کیلوگرم',
      updatedAt: AT,
      isStale: true,
    };
    render(<AdvisorBlocks blocks={[block]} onPick={vi.fn()} />);
    expect(screen.getByText('استعلام از کارشناس')).toBeInTheDocument();
    // Nothing that could be read as a price for a product we will not quote.
    expect(screen.queryByText(/۰ تومان/)).not.toBeInTheDocument();
  });

  it('stacks the comparison as one card per mill, with a visible cheapest badge', () => {
    const block: AdvisorBlock = {
      kind: 'compare',
      title: 'میلگرد · آجدار',
      subtitle: 'سایز ۱۴ · ۲۰ تن',
      updatedAt: AT,
      tonnage: 20,
      rows: [
        {
          factory: 'فایکو',
          pricePerKg: 41_000,
          totalToman: 820_000_000,
          rowCount: 2,
          updatedAt: AT,
          cheapest: true,
        },
        { factory: 'ذوب‌آهن', pricePerKg: 42_000, totalToman: 840_000_000, rowCount: 1, updatedAt: AT },
      ],
      savingsVsNextToman: 20_000_000,
    };
    render(<AdvisorBlocks blocks={[block]} onPick={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // The winner carries a WORD, not only a tint (accessibility.md §colour).
    expect(screen.getByText('ارزان‌ترین')).toBeInTheDocument();
    // A one-row average is labelled as the single quote it is.
    expect(screen.getByText('تک‌منبع')).toBeInTheDocument();
  });

  it('drops a block kind it does not know instead of throwing', () => {
    const unknown = { kind: 'something-new', title: 'x' } as unknown as AdvisorBlock;
    const { container } = render(<AdvisorBlocks blocks={[unknown]} onPick={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  /**
   * The forecast card carries a guarantee the arithmetic cannot: that what a
   * reader SEES is a direction and a range, and that the caveat is on the
   * card rather than left to the model to remember saying.
   */
  describe('the price-outlook card', () => {
    const forecast: AdvisorBlock = {
      kind: 'forecast',
      title: 'میلگرد ۱۴ ذوب‌آهن',
      direction: 'up',
      confidence: 'medium',
      bandLowPct: 1.4,
      bandHighPct: 6.2,
      horizonLabel: '۱ تا ۲ هفتهٔ آینده',
      reason: 'قیمت این محصول در ۳۰ روز گذشته ۴٫۱ درصد بالا رفته و هم‌جهت با دلار حرکت کرده.',
      drivers: [
        { label: 'دلار', changePct: 3.2, correlation: 0.71 },
        { label: 'طلای ۱۸ عیار', changePct: 1.1, correlation: 0.04 },
      ],
      basedOnDays: 30,
      ownChangePct: 4.1,
      updatedAt: AT,
    };

    it('leads with a direction in words, not with a number', () => {
      render(<AdvisorBlocks blocks={[forecast]} onPick={vi.fn()} />);
      expect(screen.getByText('رو به بالا')).toBeInTheDocument();
      expect(screen.getByText('اتکای متوسط')).toBeInTheDocument();
    });

    it('shows the range as a range, and only ever in percent', () => {
      const { container } = render(<AdvisorBlocks blocks={[forecast]} onPick={vi.fn()} />);
      expect(screen.getByText(/بازهٔ تقریبی تغییر/)).toBeInTheDocument();
      // Nothing on this card may read as a Toman figure for a future date.
      expect(container.textContent).not.toMatch(/تومان/);
    });

    it('carries its own caveat, so a forgotten sentence cannot drop it', () => {
      render(<AdvisorBlocks blocks={[forecast]} onPick={vi.fn()} />);
      expect(screen.getByText(/برآورد جهت‌دار از روی داده‌های گذشته است، نه قیمت قطعی/)).toBeInTheDocument();
      expect(screen.getByText(/قیمت معتبر همان قیمتی است که در پیش‌فاکتور همان روز/)).toBeInTheDocument();
    });

    it('lists a driver that correlates with nothing, rather than quietly hiding it', () => {
      render(<AdvisorBlocks blocks={[forecast]} onPick={vi.fn()} />);
      // The card proving it looked is more trustworthy than an omission.
      expect(screen.getByText('طلای ۱۸ عیار')).toBeInTheDocument();
      expect(screen.getByText(/۰٫۰۴/)).toBeInTheDocument();
    });

    it('offers acting on today’s price as the next step', async () => {
      const onPick = vi.fn();
      render(<AdvisorBlocks blocks={[forecast]} onPick={onPick} />);
      await userEvent.click(screen.getByRole('button', { name: /پیش‌فاکتور با قیمت امروز/ }));
      expect(onPick).toHaveBeenCalledWith(expect.stringContaining('میلگرد ۱۴ ذوب‌آهن'));
    });
  });

  it('describes a sparkline in words for anyone who cannot see it', () => {
    const block: AdvisorBlock = {
      kind: 'trend',
      title: 'میلگرد ۱۴',
      unitLabel: 'تومان / کیلوگرم',
      rangeLabel: '۳۰ روز اخیر',
      values: [40_000, 41_000, 40_500, 42_000],
      dates: [
        '2026-07-01T00:00:00.000Z',
        '2026-07-08T00:00:00.000Z',
        '2026-07-15T00:00:00.000Z',
        '2026-07-22T00:00:00.000Z',
      ],
      changePct: 5,
    };
    render(<AdvisorBlocks blocks={[block]} onPick={vi.fn()} />);
    expect(screen.getByText(/روند قیمت میلگرد ۱۴ در ۳۰ روز اخیر/)).toBeInTheDocument();
  });
});
