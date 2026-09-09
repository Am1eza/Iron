'use client';
import { useTranslations } from 'next-intl';
import { Heading, Text } from '@/components/ui';
import type { ToolSlug } from './ToolRenderer';

/**
 * The translated half of `/tools/[tool]`'s H1 + intro. `page.tsx` (a Server
 * Component, needed for `generateStaticParams`/`generateMetadata`) keeps its
 * own `TOOLS` record as the fa source for metadata and the breadcrumb's
 * trailing segment (the established SSR-shell exception) — but the actual
 * VISIBLE heading above each calculator is real content, so it renders here
 * instead, from a new `toolsPage` namespace (distinct from each calculator's
 * own internal `weightCalculator`/`projectEstimator`/`costCalculator`
 * namespace, which covers its form/results UI, not this page-level intro).
 */
export function ToolPageHeading({ tool }: { tool: ToolSlug }) {
  const t = useTranslations('toolsPage');
  return (
    <>
      <Heading level={1} id="tool-title">
        {t(`${tool}.title`)}
      </Heading>
      <Text color="muted">{t(`${tool}.intro`)}</Text>
    </>
  );
}
