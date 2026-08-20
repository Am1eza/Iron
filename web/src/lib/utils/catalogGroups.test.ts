import { describe, it, expect } from 'vitest';
import { groupByLabel, groupSubCategories } from './catalogGroups';

type Item = { id: string; groupLabel?: string | null };

describe('groupByLabel', () => {
  it('keeps ungrouped items as their own singleton cluster, in order', () => {
    const items: Item[] = [{ id: 'a', groupLabel: null }, { id: 'b', groupLabel: null }];
    expect(groupByLabel(items)).toEqual([
      { label: null, items: [{ id: 'a', groupLabel: null }] },
      { label: null, items: [{ id: 'b', groupLabel: null }] },
    ]);
  });

  it('clusters contiguous items sharing a groupLabel under one heading', () => {
    const items: Item[] = [
      { id: 'a', groupLabel: null },
      { id: 'b', groupLabel: 'ورق رنگی' },
      { id: 'c', groupLabel: 'ورق رنگی' },
    ];
    const result = groupByLabel(items);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      label: 'ورق رنگی',
      items: [
        { id: 'b', groupLabel: 'ورق رنگی' },
        { id: 'c', groupLabel: 'ورق رنگی' },
      ],
    });
  });

  it('reunites items sharing a groupLabel even when NOT contiguous, without duplicating the heading', () => {
    const items: Item[] = [
      { id: 'a', groupLabel: 'ورق رنگی' },
      { id: 'x', groupLabel: null },
      { id: 'b', groupLabel: 'ورق رنگی' },
    ];
    const result = groupByLabel(items);
    // Exactly one «ورق رنگی» cluster, not two — a later match must join the
    // FIRST cluster with that label, not start a fresh one.
    const labeled = result.filter((g) => g.label === 'ورق رنگی');
    expect(labeled).toHaveLength(1);
    expect(labeled[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('groupSubCategories', () => {
  type Sub = { slug: string; name: string; groupLabel?: string | null };

  it('promotes the member whose name IS the group label to be the heading', () => {
    // The real «چهارپهلو» case that rendered a bare duplicate in the mega-menu.
    const subs: Sub[] = [
      { slug: 'chaharpahlu', name: 'چهارپهلو', groupLabel: 'چهارپهلو' },
      { slug: 'chaharpahlu-alloy', name: 'چهارپهلو آلیاژی', groupLabel: 'چهارپهلو' },
    ];
    expect(groupSubCategories(subs)).toEqual([
      { label: 'چهارپهلو', lead: subs[0], items: [subs[1]] },
    ]);
  });

  it('leaves lead null when no member matches, so the label stays a plain heading', () => {
    // «مانیسمان» over «لوله مانیسمان داخلی»/«… خارجی» — nothing to promote.
    const subs: Sub[] = [
      { slug: 'seamless-internal', name: 'لوله مانیسمان داخلی', groupLabel: 'مانیسمان' },
      { slug: 'seamless-external', name: 'لوله مانیسمان خارجی', groupLabel: 'مانیسمان' },
    ];
    const [group] = groupSubCategories(subs);
    expect(group).toEqual({ label: 'مانیسمان', lead: null, items: subs });
  });

  it('ignores stray whitespace around an admin-entered label', () => {
    const subs: Sub[] = [
      { slug: 'a', name: 'چهارپهلو', groupLabel: 'چهارپهلو ' },
      { slug: 'b', name: 'چهارپهلو آلیاژی', groupLabel: 'چهارپهلو ' },
    ];
    expect(groupSubCategories(subs)[0]!.lead).toBe(subs[0]);
  });

  it('passes ungrouped items through untouched, one singleton each', () => {
    const subs: Sub[] = [
      { slug: 'black', name: 'سیاه', groupLabel: null },
      { slug: 'oiled', name: 'روغنی', groupLabel: null },
    ];
    expect(groupSubCategories(subs)).toEqual([
      { label: null, lead: null, items: [subs[0]] },
      { label: null, lead: null, items: [subs[1]] },
    ]);
  });
});
