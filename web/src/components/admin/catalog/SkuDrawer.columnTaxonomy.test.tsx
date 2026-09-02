/**
 * The admin side of the 1405/06/09 column-taxonomy pass over پروفیل,
 * فلزات رنگی and میلگرد (see catalogLabels' `gradeAsStandard`,
 * `standardAsCondition`, `REBAR_ATTRS` and `PROFILE_ATTRS`).
 *
 * Every one of those changes is display-only on the public table, which is
 * exactly why the form is the half that can break silently. Three ways:
 *
 *  1. a relabelled column whose key the drawer does not recognise loses its
 *     input entirely — میلگرد's A2/A3 becomes uneditable;
 *  2. a column re-pointed at a different stored field keeps an input that
 *     writes the OLD field, so an operator fills a box the page never reads
 *     (تسمه مسی's «حالت», which lives in `skus.standard`); and
 *  3. two boxes end up carrying the same label over different columns —
 *     میلگرد's relabelled `grade` beside the advanced raw `standard` box.
 *
 * None of the three shows up on the public page. They show up here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCategory, AdminSubCategory } from '@/lib/api/resources/admin';
import { SkuDrawer } from './SkuDrawer';

vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    catalogSuggestions: () =>
      Promise.resolve({
        factories: [],
        sizes: [],
        grades: [],
        dimensions: [],
        schedules: [],
        standards: [],
        groupLabels: [],
      }),
    createSku: vi.fn(),
    updateSku: vi.fn(),
  },
}));

const CATEGORIES = [
  { id: 'c1', slug: 'rebar', name: 'میلگرد' },
  { id: 'c3', slug: 'profile', name: 'پروفیل' },
  { id: 'c7', slug: 'felezat-rangi', name: 'فلزات رنگی' },
] as AdminCategory[];

/** The live slugs, read from the production catalog API (2026-08-31). */
const SUBS = [
  { id: 's-deformed', categoryId: 'c1', slug: 'deformed', name: 'میلگرد آجدار' },
  { id: 's-plain', categoryId: 'c1', slug: 'mylgrd-sadh', name: 'میلگرد ساده' },
  { id: 's-stainless', categoryId: 'c1', slug: 'stainless', name: 'میلگرد استیل' },
  { id: 's-sotuni', categoryId: 'c3', slug: 'profil-sotuni', name: 'پروفیل ستونی' },
  { id: 's-strip', categoryId: 'c7', slug: 'copper-strip', name: 'تسمه مسی' },
  { id: 's-cupipe', categoryId: 'c7', slug: 'copper-pipe', name: 'لوله مسی' },
  { id: 's-alprofile', categoryId: 'c7', slug: 'aluminum-profile', name: 'پروفیل آلومینیوم' },
] as AdminSubCategory[];

function openDrawer(defaultSubId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SkuDrawer
        sku={null}
        categories={CATEGORIES}
        subs={SUBS}
        defaultSubId={defaultSubId}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('SkuDrawer — the 1405/06/09 column taxonomy reaches the admin form', () => {
  /* -------------------------------- میلگرد -------------------------------- */

  it('keeps ONE editable box for میلگرد آجدار, now named «استاندارد»', () => {
    // `gradeAsStandard` is a re-label of `skus.grade`, not a move to
    // `skus.standard`. If the drawer failed to recognise the key the whole
    // box would vanish and A2/A3 would become uneditable.
    openDrawer('s-deformed');
    expect(screen.getByLabelText('استاندارد')).toBeInTheDocument();
    expect(screen.getAllByLabelText('استاندارد')).toHaveLength(1);
    expect(screen.queryByLabelText('گرید')).toBeNull();
    // It writes `grade`, not `standard` — `PickerInput` only names its
    // datalist from the `id` prop, so that is the tell.
    expect(screen.getByLabelText('استاندارد').getAttribute('list')).toBe('sku-grade-options');
  });

  it('does not leave a second «استاندارد» box over a different column', () => {
    // The advanced section carries a raw `skus.standard` picker also called
    // «استاندارد». Two same-named boxes writing two columns is how an
    // operator's value lands where nothing reads it.
    openDrawer('s-deformed');
    expect(document.querySelectorAll('#sku-standard-options')).toHaveLength(0);
  });

  it('gives میلگرد ساده both its «استاندارد» and the «حالت» it gained', () => {
    openDrawer('s-plain');
    expect(screen.getByLabelText('استاندارد')).toBeInTheDocument();
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    // «حالت» here IS the branch length, so the generic length box must not
    // also render — two inputs on one column can only disagree.
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });

  it('gives میلگرد استیل «آلیاژ» + «حالت», never «گرید»', () => {
    // The one stainless line filed under میلگرد; its stored grade is
    // 316L/310S/304L, which is an alloy by any reading.
    openDrawer('s-stainless');
    expect(screen.getByLabelText('آلیاژ')).toBeInTheDocument();
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
    expect(screen.queryByLabelText('استاندارد')).toBeNull();
    expect(screen.getByLabelText('آلیاژ').getAttribute('list')).toBe('sku-grade-options');
  });

  /* ----------------------------- فلزات رنگی ----------------------------- */

  it('points تسمه مسی’s «حالت» box at the field the page actually reads', () => {
    // The whole bug: header right, field wrong. `condition` is null on all
    // 18 live rows while «شاخه ۴ متری» sits in `standard` on all 18.
    openDrawer('s-strip');
    const box = screen.getByLabelText('حالت');
    expect(box.getAttribute('list')).toBe('sku-standard-options');
    expect(screen.getAllByLabelText('حالت')).toHaveLength(1);
    expect(screen.queryByLabelText('گرید')).toBeNull();
    // …and the advanced raw «استاندارد» picker is gone, or it would be a
    // second control over the very same column.
    expect(screen.queryByLabelText('استاندارد')).toBeNull();
  });

  it('collects لوله مسی’s «ضخامت» and its new «حالت» separately', () => {
    openDrawer('s-cupipe');
    // «ضخامت» is `skus.grade` relabelled (it literally stores «ضخامت ۰.۸۱»).
    expect(screen.getByLabelText('ضخامت').getAttribute('list')).toBe('sku-grade-options');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
  });

  it('renames پروفیل آلومینیوم’s length box to the «حالت» ahanonline uses', () => {
    openDrawer('s-alprofile');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });

  /* -------------------------------- پروفیل -------------------------------- */

  it('swaps پروفیل ستونی’s dead «گرید» box for the «حالت» its source has', () => {
    // 6 live rows, `grade` null on every one — the box could only ever
    // collect a value no source publishes and no page would show.
    openDrawer('s-sotuni');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
    // The «ضخامت» wall-gauge box comes with it (PROFILE_THICKNESS_SUBS).
    expect(screen.getByLabelText('ضخامت')).toBeInTheDocument();
  });
});
