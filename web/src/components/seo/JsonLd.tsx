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
  const withUrls = items
    .filter((c): c is { label: string; href: string } => Boolean(c.href))
    .map((c) => ({ name: c.label, url: c.href }));
  if (withUrls.length === 0) return null;
  return <JsonLd data={breadcrumbJsonLd(withUrls)} />;
}
