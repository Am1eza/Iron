import { breadcrumbJsonLd } from '@/lib/seo';
import type { Crumb } from '@/components/ui';

/**
 * Renders a schema.org JSON-LD `<script>` from a builder in `lib/seo.ts`.
 * Server-rendered into the document so crawlers see it without executing JS.
 * Accepts one object or an array (multiple graphs).
 */
export function JsonLd({ data }: { data: object | object[] }) {
  // Fields inside `data` (article titles, SKU/category names, breadcrumb
  // labels, ...) are admin- or catalog-authored strings validated only for
  // length, not markup — an unescaped `</script>` in one of them would break
  // out of this tag and execute as a second, attacker-controlled <script>.
  // Escaping `<` (as its JS unicode form) neutralizes any tag-close sequence
  // while staying valid JSON — `<` is not a JSON control character.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/**
 * BreadcrumbList JSON-LD paired with the visual <Breadcrumbs/> (D5 / N7).
 *
 * Callers give the LAST crumb an `href` too — its own canonical path. That is
 * invisible on screen: <Breadcrumbs/> renders the final item as a
 * non-interactive `aria-current="page"` span regardless of `href`, so the
 * link is emitted only into the structured data, where the terminal
 * `ListItem` needs an `item` to be a resolvable node. Do not "clean up" those
 * hrefs as unused — see `breadcrumbJsonLd`.
 */
export function BreadcrumbJsonLd({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  const entries = items.map((c) => ({ name: c.label, url: c.href }));
  const data = breadcrumbJsonLd(entries);
  // A single-node trail (or none) says nothing a crawler cannot already see.
  if (data.itemListElement.length < 2) return null;
  return <JsonLd data={data} />;
}
