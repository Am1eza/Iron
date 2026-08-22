import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Heading, Text, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { ToolRenderer, type ToolSlug } from '@/components/tools/ToolRenderer';
import { ProjectEstimatorGuide } from '@/components/tools/ProjectEstimatorGuide';

const TOOLS: Record<ToolSlug, { title: string; intro: string }> = {
  weight: {
    title: 'وزن‌سنج مقاطع فولادی',
    intro:
      'وزن تئوریک میلگرد، ورق، لوله، تسمه، نبشی، تیرآهن و ناودانی را با فرمول استاندارد و چگالی فولاد ۷٫۸۵ گرم بر سانتی‌متر مکعب حساب کنید. نتیجه برای هر شاخه و کل سفارش، همراه با فرمولِ به‌کاررفته نمایش داده می‌شود.',
  },
  project: {
    title: 'برآورد آهن‌آلات پروژه',
    intro:
      'نوع پروژه (ساختمان بتنی، اسکلت فلزی یا سولهٔ صنعتی) را انتخاب کنید و برآورد اولیه‌ای از مصالح موردنیاز و هزینهٔ تقریبی آن به‌دست آورید. برای عدد دقیق، با مشاور هوشمند گفتگو کنید.',
  },
  cost: {
    title: 'محاسبهٔ هزینهٔ خرید',
    intro:
      'دسته و محصول را انتخاب کنید، مقدار را به شاخه یا کیلوگرم وارد کنید و هزینهٔ تقریبی خرید را با احتساب ارزش افزوده و زمان تحویل ببینید. سپس مستقیم به سبد استعلام بیفزایید.',
  },
};

const TOOL_SLUGS = Object.keys(TOOLS) as ToolSlug[];

function isToolSlug(value: string): value is ToolSlug {
  return (TOOL_SLUGS as string[]).includes(value);
}

type Params = { params: Promise<{ tool: string }> };

export function generateStaticParams() {
  return TOOL_SLUGS.map((tool) => ({ tool }));
}

/* An unknown tool slug is turned into a real 404 by middleware (see
 * lib/server/seo/knownPaths.ts) — `notFound()` below does not set the status
 * in this Next version, so on its own it produced a cached Soft 404 200. */

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tool } = await params;
  if (!isToolSlug(tool)) {
    return buildMetadata({ title: 'ابزارها', path: routes.tool('weight') });
  }
  const t = TOOLS[tool];
  return buildMetadata({
    title: t.title,
    description: t.intro,
    path: routes.tool(tool),
  });
}

export default async function ToolPage({ params }: Params) {
  const { tool } = await params;
  if (!isToolSlug(tool)) notFound();

  const t = TOOLS[tool];
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'ابزارها' },
    { label: t.title, href: routes.tool(tool) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={8}>
          <Stack gap={3}>
            <Breadcrumbs items={crumbs} />
            <Heading level={1} id="tool-title">
              {t.title}
            </Heading>
            <Text color="muted">{t.intro}</Text>
          </Stack>

          <ToolRenderer tool={tool} />

          {tool === 'project' ? <ProjectEstimatorGuide /> : null}
        </Stack>
      </Section>
    </Container>
  );
}
