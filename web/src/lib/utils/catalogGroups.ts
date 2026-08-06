/**
 * Clusters items that share a `groupLabel` for DISPLAY only — never changes
 * the underlying order or introduces a real hierarchy level (see
 * server/db/schema/catalog.ts for why: the model is a hard two-level
 * Category → SubCategory, and `groupLabel` is a display-time cluster key on
 * top of it, e.g. «ورق رنگی داخلی» and «ورق رنگی خارجی» both tagged «ورق
 * رنگی»). Each cluster surfaces at the position of its first member; later
 * members with the same label join that cluster wherever they actually sit
 * in the input array, so the heading isn't duplicated if the group isn't
 * contiguous. Ungrouped items (`groupLabel` null/undefined) are their own
 * singleton "cluster" with `label: null` — callers skip the heading for those.
 */
export function groupByLabel<T extends { groupLabel?: string | null }>(
  items: readonly T[],
): Array<{ label: string | null; items: T[] }> {
  const clusters: Array<{ label: string | null; items: T[] }> = [];
  const clusterForLabel = new Map<string, number>();
  for (const x of items) {
    const existingIndex = x.groupLabel ? clusterForLabel.get(x.groupLabel) : undefined;
    if (existingIndex !== undefined) {
      clusters[existingIndex]!.items.push(x);
      continue;
    }
    if (x.groupLabel) clusterForLabel.set(x.groupLabel, clusters.length);
    clusters.push({ label: x.groupLabel ?? null, items: [x] });
  }
  return clusters;
}
