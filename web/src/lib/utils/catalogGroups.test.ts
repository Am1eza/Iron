import { describe, it, expect } from 'vitest';
import { groupByLabel } from './catalogGroups';

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
