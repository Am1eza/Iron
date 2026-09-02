import { test, expect } from '@playwright/test';
import { BASE_URL, PANEL_BASE_URL } from '../playwright.config';
import { loginToPanel } from './adminLogin';
import { formatToman } from '../src/lib/utils/format';

/**
 * The two screens the whole business runs on: «قیمت‌گذاری» and «کاتالوگ».
 * Prices here are 100% admin-entered (see CLAUDE.md's locked decisions), so
 * if these are awkward or lossy, nothing else about the product matters.
 *
 * This drives the REAL screens against the real live-mode stack (see
 * playwright.config.ts) as the seeded admin fixture, and — the part no
 * component test can give — follows a price the whole way from the grid to
 * what a customer's browser is served.
 */
/** seed.ts — role `admin`, holds pricing:write + catalog:write. */
const ADMIN = '09120000000';

/**
 * ONE login for the whole file, on ONE shared page.
 *
 * admin-rbac.spec.ts can afford a fresh login per case because it uses a
 * different fixture mobile each time. Every case here needs the SAME account
 * (only `admin` holds both pricing:write and catalog:write), and the OTP
 * request endpoint enforces a per-mobile RESEND COOLDOWN that
 * DISABLE_RATE_LIMIT_FOR_TESTS does not lift — so back-to-back logins as
 * 09120000000 answered «برای ارسال مجدد کمی صبر کنید» and all nine cases
 * failed at the login form, looking exactly like a broken admin area and
 * being nothing of the sort.
 *
 * Not `storageState`: Playwright resolves that option while BUILDING the
 * first test's context, i.e. strictly before this file's `beforeAll` could
 * write the file — the run dies with ENOENT before a single assertion. A
 * shared context needs no config change (a `setup` project would mean
 * editing playwright.config.ts, which siblings share), and `workers: 1` plus
 * `mode: 'serial'` already make one page safe.
 */
let ctx: import('@playwright/test').BrowserContext;
let page: import('@playwright/test').Page;

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  // Warm the OTP route through 127.0.0.1 first — `next dev` compiles on
  // demand (6-15s), and that latency would otherwise land inside the login.
  // A throwaway number, so no cooldown is spent on the real fixture.
  const warm = await browser.newContext({ baseURL: BASE_URL });
  await warm.request
    .post(`${BASE_URL}/api/auth/otp/request`, {
      headers: { origin: BASE_URL },
      data: { mobile: '09129990001' },
    })
    .catch(() => {});
  await warm.close();

  ctx = await browser.newContext({ baseURL: PANEL_BASE_URL });
  page = await ctx.newPage();
  await loginToPanel(page, ADMIN, '/admin');
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/);
});

test.afterAll(async () => {
  await ctx?.close();
});

async function openPricing() {
  await page.goto('/admin/pricing');
  await expect(page.getByRole('heading', { name: 'قیمت‌گذاری روزانه' })).toBeVisible();
  // The grid is client-fetched; wait for a real row rather than the shell.
  await expect(page.locator('table').first().locator('tbody tr').first()).toBeVisible({ timeout: 60_000 });
}

async function openCatalog() {
  await page.goto('/admin/catalog');
  await expect(page.getByRole('heading', { name: 'کاتالوگ' })).toBeVisible();
  await expect(page.locator('table').first().locator('tbody tr').first()).toBeVisible({ timeout: 60_000 });
}

/* ------------------------------- pricing -------------------------------- */

test('pricing grid loads the seeded catalog with editable price cells', async () => {
  await openPricing();
  const rows = page.locator('table').first().locator('tbody tr');
  expect(await rows.count()).toBeGreaterThan(3);
  // Every row must offer an addressable, labelled price input — this is the
  // entire data-entry surface.
  const firstPrice = rows.first().locator('input[data-col="price"]');
  await expect(firstPrice).toBeVisible();
  await expect(firstPrice).not.toHaveValue('');
});

test('keyboard-only entry: type, Enter, land on the next row, save from the keyboard', async () => {
  await openPricing();
  const priceCells = page.locator('input[data-col="price"]');
  const first = priceCells.nth(0);
  const second = priceCells.nth(1);

  await first.focus();
  // Persian digits — an owner typing on a Persian keyboard produces «۳۰۱۰۰۰»,
  // and the cell has to accept it, not reject it as non-numeric.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('۳۰۱۰۰۰');
  await expect(first).toHaveValue('۳۰۱,۰۰۰'); // grouped, Persian, no re-typing needed

  await page.keyboard.press('Enter');
  await expect(second).toBeFocused();

  // The save bar appears and states the count, so the operator can commit
  // without reaching for the mouse.
  await expect(page.getByText(/قیمت تغییر کرده است\./)).toBeVisible();
  const saveBtn = page.getByRole('button', { name: /ذخیرهٔ .* قیمت/ });
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
  await expect(page.getByText(/قیمت ذخیره شد\./)).toBeVisible({ timeout: 30_000 });
});

test('thousands separators, «تومان» and Latin digits are all accepted, not rejected', async () => {
  await openPricing();
  const cell = page.locator('input[data-col="price"]').first();
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('302,500 تومان');
  // Everything that is not a digit is discarded rather than failing
  // validation — an owner pasting from a price list must not be lectured.
  await expect(cell).toHaveValue('۳۰۲,۵۰۰');
  await expect(cell).not.toHaveAttribute('aria-invalid', 'true');
});

test('a saved price reaches the public page and the public API', async () => {
  await openPricing();
  const row = page.locator('table').first().locator('tbody tr').first();
  const cell = row.locator('input[data-col="price"]');
  // The product name off the cell's own accessible name («قیمت ‌X»), not off a
  // `td` — reading a cell by column index is exactly the kind of assertion
  // that fails for layout reasons and gets mistaken for a product bug.
  const name = ((await cell.getAttribute('aria-label')) ?? '').replace(/^قیمت\s*/, '').trim();
  expect(name).not.toBe('');

  // A distinctive number nothing else in the seed can produce.
  const price = 317_419;
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(String(price));
  await page.getByRole('button', { name: /ذخیرهٔ .* قیمت/ }).click();
  await expect(page.getByText(/قیمت ذخیره شد\./)).toBeVisible({ timeout: 30_000 });

  // The public API is a DIFFERENT origin path (no panel host) and carries its
  // own cache headers — commit 7b73798 swapped stale-while-revalidate for an
  // ETag validator, so this is the assertion that the loop still closes.
  const started = Date.now();
  await expect(async () => {
    const res = await page.request.get(`${BASE_URL}/api/categories/rebar`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { rows: Array<{ name: string; current: { price: number } }> };
    // Matched on the PRICE, then cross-checked on the name: Persian product
    // names carry ZWNJ (U+200C) and directional marks that `innerText` does
    // not reproduce byte-for-byte, so an `===` on the raw strings fails for
    // reasons that have nothing to do with whether the loop closed.
    const strip = (s: string) => s.replace(/[\s\u200b-\u200f\u061c]+/g, '');
    const hit = body.rows.find((r) => r.current.price === price);
    expect(hit, 'the saved price never reached the public API').toBeTruthy();
    expect(strip(hit!.name)).toBe(strip(name));
  }).toPass({ timeout: 60_000 });
  // eslint-disable-next-line no-console
  console.log(`[loop] admin save → public API in ${Date.now() - started}ms`);

  // …and the rendered page a customer actually gets (ISR, revalidated by the
  // save's `safeRevalidatePath`).
  //
  // Built via the same `formatToman` the app itself renders with, not a
  // hardcoded literal: an early version of this assertion hardcoded
  // '۳۱۷,۴۱۹' with an ASCII comma, but formatToman's real output uses ٬
  // (U+066C, the Arabic thousands separator — see format.test.ts's own
  // '۳۲٬۴۵۰ تومان'), so the literal could never match and the test failed
  // on a typo in itself, not on any defect in the save→publish loop.
  const expectedOnPage = formatToman(price, false);
  await expect(async () => {
    const res = await page.request.get(`${BASE_URL}/prices/rebar`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(expectedOnPage);
  }).toPass({ timeout: 60_000 });
});

test('a filter change does not silently throw away unsaved edits', async () => {
  await openPricing();
  const cell = page.locator('input[data-col="price"]').first();
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('303000');
  await expect(page.getByText(/قیمت تغییر کرده است\./)).toBeVisible();

  // Switching category with drafts pending must ASK first — losing a
  // half-finished column of prices to a stray click is the single most
  // expensive thing this screen could do.
  // exact: true — 'دسته' is otherwise a substring match of the adjacent
  // 'زیر‌دسته' (sub-category) select, and Playwright's default getByLabel
  // matching is substring, not exact. Without it this resolves to two
  // elements and throws a strict-mode violation before either select is ever
  // touched — a locator ambiguity, not a defect in the filter itself.
  await page.getByLabel('دسته', { exact: true }).selectOption({ index: 1 });
  // getByRole('heading', …), not getByText: the confirm modal's body text
  // ("۱ قیمت ذخیره‌نشده دارید. با تغییر فیلتر از بین می‌رود…") also contains
  // the title as a substring, so a plain text query resolves to both the
  // <h2> and the body <div> and throws a strict-mode violation — the modal
  // itself was rendering correctly the whole time.
  await expect(page.getByRole('heading', { name: 'تغییر فیلتر' })).toBeVisible();
});

test('search filters the grid without discarding an edit made before typing', async () => {
  await openPricing();
  const cell = page.locator('input[data-col="price"]').first();
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('304000');
  await expect(page.getByText('۱ قیمت تغییر کرده است.')).toBeVisible();

  // The search box is a VIEW filter. Typing something that matches nothing
  // must not drop the pending edit from the save payload.
  await page.getByLabel('جستجوی کالا').fill('zzzzz-no-such-product');
  await expect(page.getByText('با این فیلتر کالایی پیدا نشد')).toBeVisible();
  await expect(page.getByText('۱ قیمت تغییر کرده است.')).toBeVisible();
});

/* ------------------------------- catalog -------------------------------- */

test('catalog lists products, paginates, and searches across categories', async () => {
  await openCatalog();
  const table = page.locator('table').first();

  // The search box promises name/slug/size/factory — a slug pasted out of a
  // customer's URL has to find the product.
  const firstSlug = (await table.locator('tbody tr').first().locator('td').nth(1).innerText())
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .pop()!;
  await page.getByLabel('جستجوی کالا').fill(firstSlug);
  await expect(page.getByText('جستجو در همهٔ دسته‌ها')).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(1, { timeout: 30_000 });
});

test('creating a product from the drawer lands it in the catalog and in pricing', async () => {
  await openCatalog();
  const table = page.locator('table').first();

  await page.getByRole('button', { name: 'کالای جدید' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();

  // Pick a sub-category by its visible label rather than an id — this is the
  // one field the form insists on, and everything else is derived from it.
  const subSelect = drawer.locator('#sku-sub');
  await subSelect.selectOption({ index: 1 });
  // Either label: this field is «ضخامت» under ورق and «سایز» everywhere else
  // (see catalogLabels), and the sub-category above is picked by index, so
  // which of the two words it carries isn't knowable here.
  await drawer.getByLabel(/سایز|ضخامت/).fill('۹۹');
  await drawer.getByLabel('کارخانه').fill('کارخانهٔ آزمایشی');

  // Name and URL derive themselves — the admin should never be asked for a slug.
  await expect(drawer.getByLabel('نام کالا')).not.toHaveValue('');
  await drawer.getByRole('button', { name: 'ذخیره' }).click();
  await expect(page.getByText(/کالا ساخته شد/)).toBeVisible({ timeout: 30_000 });

  // It is findable, and it is flagged as having no price yet — the only
  // signal that tells an owner there is data-entry work outstanding.
  //
  // Waiting on `tbody tr` .first() being visible is NOT a wait for the search
  // to land: the pre-search rows are already there and satisfy it instantly,
  // so on a slow runner the «بدون قیمت» assertion below used to run against
  // the OLD, priced first row and fail on a 15s budget while the filtered
  // fetch was still in flight (CI run 33373001173). Wait for the row COUNT
  // the search must produce — the same settling rule the pagination test
  // above already uses — and then read the badge out of that one row rather
  // than anywhere on the page.
  await page.getByLabel('جستجوی کالا').fill('کارخانهٔ آزمایشی');
  await expect(table.locator('tbody tr')).toHaveCount(1, { timeout: 30_000 });
  await expect(table.locator('tbody tr').first().getByText('بدون قیمت')).toBeVisible();
});

test('deleting a product removes it from the panel and from the site', async () => {
  // The catalog has no hidden state to get stuck in any more, so the thing
  // worth proving end to end is that «حذف» is honest: one click, the row is
  // gone from the panel, and the product's URL stops serving the product.
  // What this replaced was the opposite guarantee — a «غیرفعال» flag that
  // left 167 of 240 live products invisible on production while the panel
  // showed every one of them as «فعال».
  //
  // Built and destroyed inside the test: this file is `mode: 'serial'` on one
  // long-lived pglite instance, and a real delete cannot be undone in a
  // `finally` the way the old deactivate could.
  const created = await page.evaluate(async () => {
    const c = await fetch('/api/admin/catalog/categories');
    const { categories } = (await c.json()) as { categories: Array<{ id: string; slug: string }> };
    const cat = categories.find((x) => x.slug === 'rebar')!;
    const sub = await fetch('/api/admin/catalog/subcategories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: cat.id, slug: 'e2e-doomed', name: 'زیردستهٔ آزمایشی حذف', order: 900 }),
    });
    const { subCategory } = (await sub.json()) as { subCategory: { id: string; slug: string } };
    const sku = await fetch('/api/admin/catalog/skus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subCategoryId: subCategory.id,
        slug: 'e2e-doomed-sku',
        name: 'کالای آزمایشی حذف',
        unit: 'kg',
      }),
    });
    const { sku: row } = (await sku.json()) as { sku: { id: string; slug: string } };
    return { catSlug: cat.slug, subId: subCategory.id, subSlug: subCategory.slug, skuSlug: row.slug };
  });

  const publicUrl = `${BASE_URL}/prices/${created.catSlug}/${created.subSlug}/${created.skuSlug}`;
  expect((await page.request.get(publicUrl)).status()).toBe(200);

  await openCatalog();
  await page.getByPlaceholder('جستجو در نام، نشانی، سایز، کارخانه…').fill('کالای آزمایشی حذف');
  const row = page.locator('table').first().locator('tbody tr').filter({ hasText: 'کالای آزمایشی حذف' });
  await expect(row).toHaveCount(1, { timeout: 30_000 });

  await row.getByRole('button', { name: 'حذف' }).click();
  // The dialog has to state what goes with it before the admin agrees.
  await expect(page.getByText(/این کار برگشت‌پذیر نیست/)).toBeVisible();
  await page.getByRole('button', { name: 'حذف کن' }).click();

  await expect(row).toHaveCount(0, { timeout: 30_000 });

  // Deleting no longer leaves a hole where the page was. The product's URL
  // now answers a PERMANENT REDIRECT up to the sub-category it lived in, so a
  // customer arriving on a bookmark or a stale search result lands on the
  // nearest real page instead of a 404, and the link keeps its value.
  //
  // `maxRedirects: 0` is the entire point of this assertion. Playwright
  // follows redirects by default, so the plain `.get()` this used to do
  // reported the PARENT page's 200 and read exactly like a deleted product
  // still being served — which is how a correct delete failed this test.
  const afterDelete = async () => page.request.get(publicUrl, { maxRedirects: 0 });
  await expect.poll(async () => (await afterDelete()).status(), { timeout: 60_000 }).toBe(308);
  expect((await afterDelete()).headers().location).toBe(
    `/prices/${created.catSlug}/${created.subSlug}`,
  );

  // And the sub-category it lived in, so the seeded catalog is left as found.
  await page.evaluate(async (id) => {
    await fetch(`/api/admin/catalog/subcategories/${id}`, { method: 'DELETE' });
  }, created.subId);
});
