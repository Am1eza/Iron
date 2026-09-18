import { getCategories, getRows, getSubsMap, isLiveCatalog } from '@/lib/server/catalog';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { priceFacts } from '@/lib/seo/priceFacts';
import { getLocalizedName, getLocalizedBasisNoun } from '@/lib/utils/localizedNames';
import { formatToman } from '@/lib/utils/format';
import { taxonomyIsIndexable } from '../[locale]/prices/_seo/indexability';

/**
 * `/llms-full.txt` — the long companion to `public/llms.txt` (llmstxt.org):
 * one plain-text document an assistant can read to answer "what does
 * آهن‌تایم sell, at what price today, and how do I buy it" without crawling
 * 4,000 HTML pages. It was a 404 until 2026-09-18.
 *
 * Every catalog line comes from the live database through the same getters
 * and the same `taxonomyIsIndexable` rule as `sitemap.ts`, so it cannot
 * advertise a page the sitemap would not. The price lines come from
 * `priceFacts`, the builder behind the on-page FAQ, so this file and the
 * pages state the same numbers.
 *
 * `force-dynamic` for the reason spelled out at length in `sitemap.ts`: a
 * cached copy is seeded by the CI build, which has no database and would
 * ship mock fixtures. `isLiveCatalog()` is the second guard. Without a live
 * catalog the file keeps its static half and states that the catalog is
 * unavailable. It never invents one.
 */
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';
const abs = (path: string) => new URL(path, SITE_URL).toString();

const INTRO = `# آهن‌تایم (Ahantime) — full reference

> Ahantime (ahantime.com, آهن‌تایم) is an Iranian online marketplace for iron and steel: rebar, I-beams, profiles, sheet, angle and channel, pipe, stainless steel and non-ferrous metals from Iran's main mills. It publishes daily prices in Toman (excluding VAT), has an AI buying advisor grounded in those prices, and confirms a delivery time before sale. There is no online payment: a buyer requests a proforma, and a sales expert confirms the final price, delivery and order by phone.

آهن‌تایم بازار آنلاین آهن‌آلات و فولاد در ایران است: قیمت روز به تومان و بدون ارزش‌افزوده، مشاور هوش مصنوعی، پیش‌فاکتور رسمی و زمان تحویل مشخص. پرداخت آنلاین ندارد؛ خرید با پیش‌فاکتور و تماس کارشناس فروش نهایی می‌شود.

## Languages
- فارسی (primary): ${abs('/')}
- English: ${abs('/en')}
- العربية: ${abs('/ar')}
- 中文: ${abs('/zh')}

## Main pages
- Prices, all categories: ${abs('/prices')}
- AI buying advisor: ${abs('/ai')}
- Market rates (FX, gold, billet): ${abs('/market')}
- Steel weight calculator: ${abs('/tools/weight')}
- Project material estimator: ${abs('/tools/project')}
- Cut to size: ${abs('/cut-to-size')}
- Customer warehouse: ${abs('/warehouse')}
- Tenders: ${abs('/tender')}
- Blog: ${abs('/blog')}
- News: ${abs('/news')}
- About: ${abs('/about')}
- Contact: ${abs('/contact')}
`;

export async function GET(): Promise<Response> {
  const out: string[] = [INTRO];

  if (!isLiveCatalog()) {
    out.push('## Product catalog\n\nThe live catalog is not available from this deployment. See /prices.\n');
    return respond(out);
  }

  const [categories, subsMap, contact] = await Promise.all([getCategories(), getSubsMap(), getContact()]);
  const categoryRows = await Promise.all(categories.map((c) => getRows(c.slug)));

  out.push(
    `## Product catalog and today's prices\n\n` +
      `Generated ${new Date().toISOString()} from the live catalog. Prices are Toman, excluding VAT, ` +
      `and cover only products with a confirmed price today; products without one are marked «تماس بگیرید» ` +
      `(call for price) on the site and are left out here.\n`,
  );

  categories.forEach((cat, i) => {
    const rows = categoryRows[i] ?? [];
    if (!taxonomyIsIndexable(rows.length)) return;
    const en = getLocalizedName(cat, 'en');
    out.push(`### ${cat.name}${en !== cat.name ? ` — ${en}` : ''}`);
    out.push(`- Page: ${abs(routes.category(cat.slug))} (English: ${abs(`/en${routes.category(cat.slug)}`)})`);
    if (cat.description) out.push(`- About: ${cat.description}`);
    const facts = priceFacts(rows);
    if (facts) {
      const unit = getLocalizedBasisNoun(facts.rangeBasis, 'en');
      out.push(
        `- Today: ${fmt(facts.min)}–${fmt(facts.max)} Toman per ${unit} across ${facts.rangeCount} products` +
          (facts.pricedCount > facts.rangeCount
            ? ` (${facts.pricedCount - facts.rangeCount} more are priced per a different unit)`
            : '') +
          (facts.latestAt ? `; last updated ${facts.latestAt}` : '') +
          '.',
      );
    } else {
      out.push('- Today: no confirmed prices; ask for a quote on the page.');
    }
    const subs = (subsMap[cat.slug] ?? []).filter((s) =>
      taxonomyIsIndexable(rows.filter((r) => r.subCategoryId === s.slug).length),
    );
    if (subs.length > 0) {
      out.push('- Sub-categories:');
      for (const s of subs) {
        const sEn = getLocalizedName(s, 'en');
        out.push(`  - ${s.name}${sEn !== s.name ? ` / ${sEn}` : ''}: ${abs(routes.subCategory(cat.slug, s.slug))}`);
      }
    }
    out.push('');
  });

  out.push(
    `## Contact\n- Phone: ${contact.phoneLandline}, mobile ${contact.phoneMobile}` +
      (contact.email ? `\n- Email: ${contact.email}` : '') +
      `\n- Address: ${contact.address}\n`,
  );
  return respond(out);
}

function fmt(value: number): string {
  return formatToman(value, false, 'en');
}

function respond(parts: string[]): Response {
  return new Response(parts.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Prices move intraday; an hour is the same horizon the sitemap's
      // `hourly` changefreq already promises crawlers.
      'cache-control': 'public, max-age=3600',
    },
  });
}
