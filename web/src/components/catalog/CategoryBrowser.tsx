'use client';
import { useState } from 'react';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { SubGroupBand } from './SubGroupBand';
import { PriceTable } from './PriceTable';

/**
 * Client wrapper that holds the shared sub-category selection so the big
 * pick-a-family band and the in-table toolbar chips stay in sync (client request
 * #9). The async server page passes serializable rows + an optional `initialSub`
 * (deep-link landing). Both controls drive the same `sub` state.
 */
export function CategoryBrowser({
  category,
  categoryName,
  rows,
  subs,
  initialSub = null,
}: {
  category: string;
  categoryName: string;
  rows: PriceRow[];
  subs: SubCat[];
  initialSub?: string | null;
}) {
  const [sub, setSub] = useState<string | null>(initialSub);

  return (
    <>
      <SubGroupBand category={category} subs={subs} active={sub} onSelect={setSub} />
      <PriceTable
        rows={rows}
        subs={subs}
        categoryName={categoryName}
        sub={sub}
        onSubChange={setSub}
      />
    </>
  );
}
