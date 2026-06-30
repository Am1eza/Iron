import { breadcrumbJsonLd } from '@/lib/seo';
import type { Crumb } from '@/components/ui';

/**
 * Renders a schema.org JSON-LD `<script>` from a builder in `lib/seo.ts`.
 * Server-rendered into the document so crawlers see it without executing JS.
 * Accepts one object or an array (multiple graphs).
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Structured data is developer-authored (not user input) → safe to inline.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** BreadcrumbList JSON-LD paired with the visual <Breadcrumbs/> (D5 / N7). */
export function BreadcrumbJsonLd({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  // Include every crumb (the current page often has no href) so the trail is complete.
  const entries = items.map((c) => (c.href ? { name: c.label, url: c.href } : { name: c.label }));
  return <JsonLd data={breadcrumbJsonLd(entries)} />;
}
