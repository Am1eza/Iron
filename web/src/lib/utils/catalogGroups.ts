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

/**
 * A `groupByLabel` cluster, refined for DISPLAY as a heading + its members.
 *
 * `groupByLabel` alone produced a visible bug wherever a cluster's label is
 * ALSO the name of one of its members — which is the common case in this
 * taxonomy, because a group is usually created by adding a *variant* beside an
 * existing sub-category (`profile/chaharpahlu` «چهارپهلو» + the newer
 * `profile/chaharpahlu-alloy` «چهارپهلو آلیاژی», both tagged «چهارپهلو»). The
 * menu then rendered a bare, non-interactive «چهارپهلو» sitting directly above
 * a link that also said «چهارپهلو»: it reads as a broken duplicate, not as a
 * heading, and the plain-text copy is dead weight for a crawler too.
 *
 * `lead` is that member, lifted out of `items`. A caller renders it AS the
 * heading — one interactive, descriptive link — so «چهارپهلو» is the heading
 * and «چهارپهلو آلیاژی» the only child. When no member matches the label
 * («مانیسمان» over «لوله مانیسمان داخلی»/«…خارجی») `lead` is null and the
 * label is a real, styled text heading over its children.
 *
 * Comparison is on the trimmed name so an accidental trailing space in an
 * admin-entered label doesn't silently resurrect the duplicate.
 */
export type DisplayGroup<T> = { label: string | null; lead: T | null; items: T[] };

export function groupSubCategories<T extends { name: string; groupLabel?: string | null }>(
  items: readonly T[],
): Array<DisplayGroup<T>> {
  return groupByLabel(items).map(({ label, items: members }) => {
    if (!label) return { label, lead: null, items: members };
    const leadIndex = members.findIndex((m) => m.name.trim() === label.trim());
    if (leadIndex === -1) return { label, lead: null, items: members };
    return {
      label,
      lead: members[leadIndex]!,
      items: members.filter((_, i) => i !== leadIndex),
    };
  });
}
