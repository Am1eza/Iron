import type { Metadata } from 'next';
import { buildMetadata, orgJsonLd, ORG_NAME } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs, Heading, Text, Divider } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/company/PageHero';
import { FeatureGrid, type Feature } from '@/components/company/FeatureGrid';
import { ContactCard } from '@/components/company/ContactCard';
import { TagIcon, SparkIcon, CheckCircleIcon } from '@/components/primitives/icons';
import prose from '@/components/company/Prose.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'درباره ما',
  description:
    'آهن‌تایم؛ بازار آنلاین قیمت آهن و فولاد با مشاور هوشمند و تأمین مستقیم از کارخانه. اول مشورت، بعد خرید.',
  path: routes.about(),
});

const services: Feature[] = [
  {
    title: 'قیمت شفاف و لحظه‌ای',
    desc: 'قیمت روز میلگرد، تیرآهن، ورق و دیگر مقاطع فولادی با نوسان، وزن شاخه و زمان تحویل؛ به‌روز و بدون ابهام.',
    icon: <TagIcon size={22} />,
  },
  {
    title: 'مشاور هوشمند',
    desc: 'دستیار هوش مصنوعی آهن‌تایم پیش از خرید کنار شماست؛ از انتخاب سایز و گرید تا برآورد وزن و هزینهٔ پروژه.',
    icon: <SparkIcon size={22} />,
    accent: true,
  },
  {
    title: 'تأمین مستقیم از کارخانه',
    desc: 'با حذف واسطه‌ها و خرید مستقیم از کارخانه، قیمت منصفانه‌تر و اصالت کالا را تضمین می‌کنیم.',
    icon: <CheckCircleIcon size={22} />,
  },
];

export default function AboutPage() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'درباره ما' },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd data={orgJsonLd()} />

      <Section space={10} aria-labelledby="about-title">
        <Stack gap={10}>
          <Stack gap={6}>
            <Breadcrumbs items={crumbs} />
            <PageHero
              id="about-title"
              eyebrow="دربارهٔ آهن‌تایم"
              title="اول مشورت، بعد خرید"
              lead={`${ORG_NAME} بازار آنلاین قیمت و تأمین آهن و فولاد است؛ جایی که خرید مصالح فولادی به‌جای حدس و گمان، با اطلاعات شفاف و مشورت درست انجام می‌شود.`}
              ctas={[
                { label: 'مشاهدهٔ قیمت‌ها', href: routes.prices(), variant: 'primary', arrow: true },
                { label: 'گفت‌وگو با مشاور هوشمند', href: routes.ai(), variant: 'secondary' },
              ]}
            />
          </Stack>

          <Divider />

          {/* Story + mission */}
          <Stack gap={4}>
            <Heading level={2}>چرا آهن‌تایم را ساختیم</Heading>
            <div className={prose.prose}>
              <p>
                بازار آهن و فولاد ایران سال‌هاست با نوسان شدید قیمت، واسطه‌های متعدد و
                اطلاعات پراکنده دست‌وپنجه نرم می‌کند. خریدار، چه{' '}
                <strong>پیمانکار</strong> باشد و چه <strong>سازندهٔ شخصی</strong>، اغلب بدون
                تصویر روشنی از قیمت واقعی و کیفیت کالا تصمیم می‌گیرد.
              </p>
              <p>
                ما آهن‌تایم را ساختیم تا این مسیر شفاف شود: قیمت‌ها لحظه‌ای و قابل اعتماد،
                مشاوره پیش از خرید در دسترس همه، و تأمین مستقیم از کارخانه بدون زنجیرهٔ
                واسطه‌ها. شعار ما یک تعهد است؛ <strong>«اول مشورت، بعد خرید»</strong>.
              </p>
            </div>
          </Stack>

          {/* What we do */}
          <Stack gap={6}>
            <Stack gap={2}>
              <Heading level={2}>چه کاری انجام می‌دهیم</Heading>
              <Text color="muted">
                آهن‌تایم سه کار را در کنار هم انجام می‌دهد تا خرید فولاد ساده، مطمئن و
                به‌صرفه شود.
              </Text>
            </Stack>
            <FeatureGrid items={services} />
          </Stack>

          {/* How buying works — no online payment */}
          <Stack gap={4}>
            <Heading level={2}>خرید چگونه انجام می‌شود؟</Heading>
            <div className={prose.prose}>
              <p>
                در آهن‌تایم پرداخت آنلاینی وجود ندارد. شما محصولات موردنظر را به{' '}
                <strong>سبد استعلام</strong> اضافه می‌کنید و یک{' '}
                <strong>پیش‌فاکتور</strong> دریافت می‌کنید؛ سپس کارشناسان ما برای
                نهایی‌سازی قیمت، موجودی و زمان تحویل با شما تماس می‌گیرند. این یعنی پیش از هر
                پرداختی، فرصت مشورت و اطمینان دارید.
              </p>
            </div>
          </Stack>

          {/* Contact */}
          <Stack gap={6}>
            <Heading level={2}>ارتباط با ما</Heading>
            <ContactCard />
          </Stack>
        </Stack>
      </Section>
    </Container>
  );
}
