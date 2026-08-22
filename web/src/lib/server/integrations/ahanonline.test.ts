/**
 * Parsing ahanonline's category pages.
 *
 * The fixture below is a trimmed copy of the real markup (fetched 1405/05/31):
 * a `data-price` attribute in RIAL, a rendered «قیمت (تومان)» cell in TOMAN
 * floored to the nearest 10, and the mill in a bold heading above the table
 * rather than in a column. Nothing on the page states the rial/toman split —
 * which is exactly why the parser cross-checks the two readings instead of
 * trusting either alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchAhanonlinePrices, parseAhanonlinePage } from './ahanonline';

/** `data-price` rides a div INSIDE the price cell (not the <tr>), and
 *  `data-name`/`data-code` ride the chart div at the end of the row — that is
 *  where they actually are on the live page. */
function priceRow(opts: {
  size: string;
  unit: string;
  delivery: string;
  updated: string;
  rial: string;
  shown: string;
  code: string;
}): string {
  return `
      <tr class="even:bg-[#F8F6F3]">
        <td class="py-[10px]">${opts.size}</td>
        <td class="py-[10px]">7</td>
        <td class="py-[10px]">6 متری</td>
        <td class="py-[10px]">${opts.unit}</td>
        <td class="py-[10px]">${opts.delivery}</td>
        <td class="py-[10px]">${opts.updated}</td>
        <td class="py-[10px]">
          <div class="font-Bold product-price text-[18px]" data-price="${opts.rial}">
            ${opts.shown}
          </div>
        </td>
        <td class="py-[10px]"><div style="direction: ltr">0.0%</div></td>
        <td class="py-[10px]">
          <div class="table-chart" data-id="92187" data-name="نبشی ${opts.size} آریان فولاد" data-code="${opts.code}"></div>
        </td>
      </tr>`;
}

const PAGE = `
<div class="font-Bold text-[18px] mb-2">نبشی آریان فولاد<span>آخرین بروزرسانی ۱۴۰۵/۵/۳۱</span></div>
<table>
  <thead><tr>
    <th>سایز</th><th>ضخامت</th><th>حالت</th><th>واحد</th>
    <th>محل تحویل</th><th>تاریخ بروزرسانی</th><th>قیمت (تومان)</th>
    <th>نوسانات</th><th>نمودار</th>
  </tr></thead>
  <tbody class="table_price">
${priceRow({ size: '70*70', unit: 'کیلوگرم', delivery: 'کارخانه', updated: '1405/5/31', rial: '735805', shown: '73,580', code: '9001' })}
${priceRow({ size: '40*40', unit: 'کیلوگرم', delivery: 'بنگاه تهران', updated: '1405/5/31', rial: '755039', shown: '75,500', code: '9002' })}
  </tbody>
</table>`;

describe('parseAhanonlinePage', () => {
  it('reads the price in Toman, the mill off the heading, and the cells by header', () => {
    const rows = parseAhanonlinePage(PAGE, 'نبشی-و-ناودانی/نبشی');
    expect(rows).toHaveLength(2);
    const [first] = rows;
    expect(first!.priceToman).toBe(73_581); // 735,805 rial ÷ 10, rounded
    expect(first!.priceRial).toBe(735_805);
    expect(first!.code).toBe('9001');
    expect(first!.group).toBe('نبشی آریان فولاد'); // «آخرین بروزرسانی…» trimmed
    expect(first!.cells['سایز']).toBe('70*70');
    expect(first!.cells['واحد']).toBe('کیلوگرم');
    expect(first!.cells['محل تحویل']).toBe('کارخانه');
  });

  it('tolerates their 10-Toman flooring of the displayed cell', () => {
    // 755,039 rial ÷ 10 = 75,503.9, displayed as 75,500. A legitimate row.
    const rows = parseAhanonlinePage(PAGE, 'نبشی-و-ناودانی/نبشی');
    expect(rows[1]!.priceToman).toBe(75_504);
  });

  it('DROPS a row whose rial attribute and Toman cell disagree', () => {
    // What a unit change on their side would look like. Writing this row would
    // have put every mirrored price at ten times its real value.
    const broken = PAGE.replace('\n            73,580\n', '\n            735,805\n');
    const rows = parseAhanonlinePage(broken, 'نبشی-و-ناودانی/نبشی');
    expect(rows.map((r) => r.code)).toEqual(['9002']);
  });

  it('ignores tables with no priced rows', () => {
    expect(parseAhanonlinePage('<table><tr><td>هیچ</td></tr></table>', 'x')).toEqual([]);
  });
});

describe('fetchAhanonlinePrices', () => {
  const ok = (body: string) => new Response(body, { status: 200 });
  const noSleep = () => Promise.resolve();

  it('parses every requested page and reports nothing as failed', async () => {
    const body = PAGE + 'x'.repeat(6000); // past the "too short = blocked" guard
    const fetchImpl = vi.fn(async () => ok(body)) as unknown as typeof fetch;
    const res = await fetchAhanonlinePrices({
      paths: ['نبشی-و-ناودانی/نبشی'],
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(res.pagesFetched).toBe(1);
    expect(res.rows).toHaveLength(2);
    expect(res.failures).toEqual([]);
  });

  it('records a bad page as a failure and keeps going instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    const res = await fetchAhanonlinePrices({
      paths: ['نبشی-و-ناودانی/نبشی'],
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(res.rows).toEqual([]);
    expect(res.failures[0]).toMatchObject({ path: 'نبشی-و-ناودانی/نبشی', error: 'HTTP 503' });
  });

  it('treats a suspiciously short 200 as a failure, not as "no products"', async () => {
    // A block page or an empty shell would otherwise read as "this category is
    // empty" and silently leave every SKU in it unmatched.
    const fetchImpl = vi.fn(async () => ok('<html></html>')) as unknown as typeof fetch;
    const res = await fetchAhanonlinePrices({
      paths: ['نبشی-و-ناودانی/نبشی'],
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(res.pagesFetched).toBe(0);
    expect(res.failures[0]!.error).toMatch(/too short/);
  });
});
