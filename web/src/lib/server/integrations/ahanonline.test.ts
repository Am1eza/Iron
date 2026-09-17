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

/** `میلگرد/قیمت-میلگرد` as served on 1405/06/26: no «تاریخ بروزرسانی»
 *  column — each priced row is followed by a collapsed accordion row that
 *  carries the date. Trimmed from the live page, markup otherwise verbatim. */
const ACCORDION_PAGE = `
<div class="font-Bold text-[18px] mb-2">میلگرد ذوب آهن اصفهان</div>
<table>
  <thead><tr>
    <th>سایز</th><th>استاندارد</th><th>محل تحویل</th><th>قیمت (تومان)</th>
  </tr></thead>
  <tbody class="table_price">
    <tr class="bg-even text-[13px]">
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center"><i onclick="toggleAccordionPrice(this)" aria-controls="p-93593" class="icon-arrow-left"></i>12</div></td>
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center">A3</div></td>
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center">کارخانه</div></td>
      <td class="font-[Bold] text-priceCallButton w-[25.0%]"><div class="product-price" data-price="968181">96,820</div></td>
    </tr>
    <tr>
      <td colspan="4" class="detail-info-price">
        <div class="flex flex-col" id="p-93593">
          <div class='priceMoreInfo'>
            <div class='priceMoreInfo_item'>
              آخرین بروز رسانی :
              1405/6/26
            </div>
            <div class='priceMoreInfo_item'>نمودار نوسانات : <span>-0.5%</span>
              <span class="table-chart" data-id="93593" data-name="میلگرد 12 ذوب آهن اصفهان آجدار A3 کارخانه" data-code="0725"><i class="icon-CHART"></i></span>
            </div>
          </div>
        </div>
      </td>
    </tr>
    <tr class="bg-odd text-[13px]">
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center">14</div></td>
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center">A3</div></td>
      <td class="w-[25.0%] px-[3px]"><div class="flex items-center justify-center">کارخانه</div></td>
      <td class="font-[Bold] text-priceCallButton w-[25.0%]"><div class="product-price" data-price="886401">88,640</div></td>
    </tr>
    <tr>
      <td colspan="4" class="detail-info-price"><div class='priceMoreInfo_item'>آخرین بروز رسانی : ۱۴۰۵/۶/۲۴</div></td>
    </tr>
  </tbody>
</table>`;

describe('parseAhanonlinePage — accordion «آخرین بروز رسانی»', () => {
  it('attaches the accordion date to the priced row directly above it', () => {
    const rows = parseAhanonlinePage(ACCORDION_PAGE, 'میلگرد/قیمت-میلگرد');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells['تاریخ بروزرسانی']).toBe('1405/6/26');
    // Persian digits normalised, so jalaliDaysAgo() can read it.
    expect(rows[1]!.cells['تاریخ بروزرسانی']).toBe('1405/6/24');
  });

  it('never overwrites a real «تاریخ بروزرسانی» column with an accordion date', () => {
    const withColumn = PAGE.replace(
      '</tbody>',
      `<tr><td colspan="9" class="detail-info-price">آخرین بروز رسانی : 1400/1/1</td></tr></tbody>`,
    );
    const rows = parseAhanonlinePage(withColumn, 'نبشی-و-ناودانی/نبشی');
    expect(rows[1]!.cells['تاریخ بروزرسانی']).toBe('1405/5/31');
  });

  it('does not let a detail row in one table date a row in another', () => {
    const orphan = `<table><thead><tr><th>سایز</th></tr></thead><tbody>
      <tr><td colspan="1" class="detail-info-price">آخرین بروز رسانی : 1399/1/1</td></tr>
    </tbody></table>${ACCORDION_PAGE}`;
    const rows = parseAhanonlinePage(orphan, 'میلگرد/قیمت-میلگرد');
    expect(rows.map((r) => r.cells['تاریخ بروزرسانی'])).toEqual(['1405/6/26', '1405/6/24']);
  });
});

/**
 * The variant ahanonline serves to the PRODUCTION host (fetched from the
 * server itself on 1405/06/26): no per-row accordion anywhere on the page —
 * the only date is this header above each table. Markup trimmed, verbatim.
 */
const HEADER_DATE_PAGE = `
<div class="font-Bold text-[18px] mb-2">میلگرد ذوب آهن اصفهان</div>
<div class="flex">
  <span class="w-[1px] bg-[#00AF9C] py-[10px] h-full mx-[10px]"></span>
  <div class="text-[16px] flex items-center justify-center text-[#AF0748]">
    <i class="icon-WATCH text-[16px] ml-[5px] "></i>
    آخرین بروزرسانی :
    <span class="text-[#00AF9C] pr-1 font-Bold">
      امروز
      ( 1405/6/26 )
    </span>
  </div>
</div>
<table class="w-full">
  <thead><tr><th>سایز</th><th>استاندارد</th><th>محل تحویل</th><th>قیمت (تومان)</th></tr></thead>
  <tbody class="table_price">
    <tr>
      <td><div>12</div></td><td><div>A3</div></td><td><div>کارخانه</div></td>
      <td><div class="product-price" data-price="968181">96,820</div></td>
    </tr>
    <tr>
      <td><div>14</div></td><td><div>A3</div></td><td><div>کارخانه</div></td>
      <td><div class="product-price" data-price="886401">88,640</div></td>
    </tr>
  </tbody>
</table>`;

describe('parseAhanonlinePage — per-table «آخرین بروزرسانی» header', () => {
  it('dates every row of the table from the header above it', () => {
    const rows = parseAhanonlinePage(HEADER_DATE_PAGE, 'میلگرد/قیمت-میلگرد');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cells['تاریخ بروزرسانی'])).toEqual(['1405/6/26', '1405/6/26']);
  });

  it('prefers a per-row accordion date over the table header (more specific)', () => {
    const mixed = HEADER_DATE_PAGE.replace(
      '  </tbody>',
      `    <tr><td colspan="4" class="detail-info-price">آخرین بروز رسانی : 1405/6/24</td></tr>
  </tbody>`,
    );
    const rows = parseAhanonlinePage(mixed, 'میلگرد/قیمت-میلگرد');
    expect(rows[1]!.cells['تاریخ بروزرسانی']).toBe('1405/6/24');
    expect(rows[0]!.cells['تاریخ بروزرسانی']).toBe('1405/6/26');
  });

  it('a real date COLUMN still wins over the header', () => {
    const rows = parseAhanonlinePage(
      `<div>آخرین بروزرسانی : ( 1400/1/1 )</div>${PAGE}`,
      'نبشی-و-ناودانی/نبشی',
    );
    expect(rows[0]!.cells['تاریخ بروزرسانی']).toBe('1405/5/31');
  });

  it('leaves rows undated when the page publishes no date at all', () => {
    const noDate = HEADER_DATE_PAGE.replace(/آخرین بروزرسانی[\s\S]*?<\/div>\s*<\/div>/, '');
    const rows = parseAhanonlinePage(noDate, 'میلگرد/قیمت-میلگرد');
    expect(rows.every((r) => !r.cells['تاریخ بروزرسانی'])).toBe(true);
  });
});

describe('fetchAhanonlinePrices', () => {
  const ok =(body: string) => new Response(body, { status: 200 });
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
