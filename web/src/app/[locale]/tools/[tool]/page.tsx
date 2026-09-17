import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ToolRenderer, type ToolSlug } from '@/components/tools/ToolRenderer';
import { ToolPageHeading } from '@/components/tools/ToolPageHeading';
import { ProjectEstimatorGuide } from '@/components/tools/ProjectEstimatorGuide';

/** The tool slugs this route serves. Title and intro copy live in the message
 *  catalogue (`toolsPage.<slug>`) — they used to be duplicated here as Persian
 *  literals, which meant an English visitor got a translated page body under a
 *  Persian heading and a Persian <title>. */
const TOOL_SLUGS_LIST = ['weight', 'project', 'cost'] as const satisfies readonly ToolSlug[];

const TOOL_SLUGS: ToolSlug[] = [...TOOL_SLUGS_LIST];

function isToolSlug(value: string): value is ToolSlug {
  return (TOOL_SLUGS as string[]).includes(value);
}

type Params = { params: Promise<{ locale: string; tool: string }> };

export function generateStaticParams() {
  return TOOL_SLUGS.map((tool) => ({ tool }));
}

/* An unknown tool slug is turned into a real 404 by middleware (see
 * lib/server/seo/knownPaths.ts) — `notFound()` below does not set the status
 * in this Next version, so on its own it produced a cached Soft 404 200. */

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, tool } = await params;
  setRequestLocale(locale);
  if (!isToolSlug(tool)) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('tools'), path: routes.tool('weight') });
  }
  const t = await getTranslations({ locale, namespace: 'toolsPage' });
  return buildMetadata({
    locale,
    title: t(`${tool}.title`),
    description: t(`${tool}.intro`),
    path: routes.tool(tool),
  });
}


export default async function ToolPage({ params }: Params) {
  const { locale, tool } = await params;
  setRequestLocale(locale);
  if (!isToolSlug(tool)) notFound();

  const t = await getTranslations('toolsPage');
  const tNav = await getTranslations();
  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('meta.notFound.tools') },
    { label: t(`${tool}.title`), href: routes.tool(tool) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={8}>
          <Stack gap={3}>
            <Breadcrumbs items={crumbs} />
            <ToolPageHeading tool={tool} />
          </Stack>

          <ToolRenderer tool={tool} />

          {tool === 'project' ? <ProjectEstimatorGuide /> : null}
        </Stack>
      </Section>
    </Container>
  );
}
