/**
 * Parsing markazeahan's category pages — the mirror's second source (US-05.3).
 *
 * The fixture is a trimmed copy of the real markup (fetched 1405/06/03). Two
 * things about it drive every case below, and both are places this source
 * gives us LESS than ahanonline does:
 *
 *   1. The price appears once, as text, with the day's movement in front of
 *      it — «بدون تغییر 630,000», «+ 2.4% 630,000». There is no `data-price`
 *      in rial to cross-check against, so the parser has to be sure it is
 *      reading the price and not the percentage.
 *   2. The freshness date is a page-level «به روز رسانی» stamp, not a column.
 *      It is what stops a page they have abandoned from being mirrored — the
 *      reason their `aluminum-rebar` page, 110 days old, is not mapped — so a
 *      page that loses the stamp has to yield nothing rather than yield undated
 *      rows.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fetchMarkazeahanPrices,
  markazeahanPath,
  pageUpdatedAt,
  parseMarkazeahanPage,
  priceFromCell,
} from './markazeahan';

function pricedRow(name: string, size: string, mill: string, priceCell: string): string {
  return `
      <tr>
        <td>${name}</td>
        <td>${size}</td>
        <td>1.2</td>
        <td>${mill}</td>
        <td>6</td>
        <td>کیلوگرم</td>
        <td>کارخانه اصفهان</td>
        <td><span>${priceCell}</span></td>
        <td></td>
        <td><a>خرید</a></td>
      </tr>`;
}

const HEADERS = `
  <thead><tr>
    <th>نام محصول</th><th>سایز</th><th>وزن هر شاخه (kg)</th><th>کارخانه</th>
    <th>طول(m)</th><th>واحد</th><th>محل بارگیری</th><th>قیمت تومان</th>
    <th>نمودار</th><th>خرید</th>
  </tr></thead>`;

const PAGE = `
<div class="head">ناودانی آلومینیوم به روز رسانی: ۱۴۰۵/۰۶/۰۳ ۰۲:۰۶</div>
<table>
${HEADERS}
  <tbody>
${pricedRow('ناودانی 20*20 آلومینیوم', '20*20', 'آلومین گستر', 'بدون تغییر 630,000')}
${pricedRow('ناودانی 20*30 آلومینیوم', '30*20', 'آلومین گستر', '+ 2.4% 630,000')}
${pricedRow('ناودانی 40*40 آلومینیوم', '40*40', 'آلومین گستر', 'تماس بگیرید')}
  </tbody>
</table>`;

const PATH = markazeahanPath('aluminum-channel-beam');

describe('priceFromCell', () => {
  it('reads the price, not the movement percentage in front of it', () => {
    // The failure this prevents is quiet: «+ 2.4% 630,000» read left-to-right
    // gives 2, and a 2-toman price is not something a plausibility band would
    // even be asked about — the row would simply be wrong.
    expect(priceFromCell('بدون تغییر 630,000')).toBe(630_000);
    expect(priceFromCell('+ 2.4% 630,000')).toBe(630_000);
    expect(priceFromCell('-1.1% 618,500')).toBe(618_500);
  });

  it('requires thousands grouping, so an ungrouped run is never a price', () => {
    expect(priceFromCell('+ 2.4%')).toBeNull();
    expect(priceFromCell('تماس بگیرید')).toBeNull();
    expect(priceFromCell('')).toBeNull();
  });

  it('reads Persian digits', () => {
    expect(priceFromCell('بدون تغییر ۶۳۰,۰۰۰')).toBe(630_000);
  });
});

describe('pageUpdatedAt', () => {
  it('reads the page-level Jalali stamp as y/m/d', () => {
    expect(pageUpdatedAt(PAGE)).toBe('1405/06/03');
  });

  it('returns empty when the page carries no stamp', () => {
    expect(pageUpdatedAt('<div>ناودانی آلومینیوم</div>')).toBe('');
  });
});

describe('parseMarkazeahanPage', () => {
  it('parses the priced rows and drops «تماس بگیرید»', () => {
    const rows = parseMarkazeahanPage(PAGE, PATH);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.priceToman)).toEqual([630_000, 630_000]);
    expect(rows[0]!.name).toBe('ناودانی 20*20 آلومینیوم');
    expect(rows[0]!.cells['سایز']).toBe('20*20');
    expect(rows[0]!.cells['کارخانه']).toBe('آلومین گستر');
  });

  it('stamps the page date onto every row so the freshness gate can see it', () => {
    // Their date is a property of the page. Copying it per row is what lets
    // `rowUpdatedAt` and `maxSourceAgeDays` work on this source unchanged.
    for (const r of parseMarkazeahanPage(PAGE, PATH)) {
      expect(r.cells['تاریخ بروزرسانی']).toBe('1405/06/03');
    }
  });

  it('yields NOTHING for a page that has lost its update stamp', () => {
    // The whole freshness story for this source is that stamp — it is why
    // their 110-day-old aluminium-rebar page is not mapped. Undated rows would
    // be copied forever, so a page without it must parse to zero and be
    // reported as a failed fetch instead.
    const undated = PAGE.replace('به روز رسانی: ۱۴۰۵/۰۶/۰۳ ۰۲:۰۶', '');
    expect(parseMarkazeahanPage(undated, PATH)).toEqual([]);
  });

  it('records no rial reading rather than inventing one', () => {
    // ahanonline publishes the price twice and the parser cross-checks them.
    // This source publishes it once; asserting a rial figure here would put a
    // number in the forensics column that nobody ever published.
    expect(parseMarkazeahanPage(PAGE, PATH)[0]!.priceRial).toBe(0);
  });
});

describe('fetchMarkazeahanPrices', () => {
  const ok = (body: string) => ({ ok: true, status: 200, text: async () => body }) as Response;

  it('fetches only the requested paths and reports the rest of the run', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return ok(PAGE + '<!--' + 'x'.repeat(6000) + '-->');
    });
    const res = await fetchMarkazeahanPrices({
      paths: [PATH],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/product-category/');
    expect(res.pagesFetched).toBe(1);
    expect(res.rows).toHaveLength(2);
    expect(res.failures).toEqual([]);
  });

  it('reports a bad page instead of failing the whole run', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    const res = await fetchMarkazeahanPrices({
      paths: [PATH],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });
    expect(res.rows).toEqual([]);
    expect(res.failures).toEqual([{ path: PATH, error: 'HTTP 503' }]);
  });

  it('treats a short body as a block page, not an empty category', async () => {
    const fetchImpl = vi.fn(async () => ok('<html>blocked</html>'));
    const res = await fetchMarkazeahanPrices({
      paths: [PATH],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });
    expect(res.failures[0]!.error).toMatch(/body too short/);
  });
});
