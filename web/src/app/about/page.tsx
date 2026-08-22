import type { Metadata } from 'next';
import { buildMetadata, orgJsonLd, ORG_NAME } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs, Heading, Text, Divider } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/company/PageHero';
import { FeatureGrid, type Feature } from '@/components/company/FeatureGrid';
import { ContactCard } from '@/components/company/ContactCard';
import {
  TagIcon,
  ClockIcon,
  AiMarkIcon,
  ChartIcon,
  CheckCircleIcon,
  PhoneIcon,
  BankIcon,
  ShieldIcon,
} from '@/components/primitives/icons';
import prose from '@/components/company/Prose.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'درباره ما',
  description:
    'آهن‌تایم؛ بازار آنلاین قیمت آهن و فولاد با مشاور هوشمند و تأمین مستقیم از کارخانه: ارزان‌تر با حذف واسطه، تحویل ۲۴ ساعته، قیمت شفاف و پشتیبانی واقعی. اول مشورت، بعد خرید.',
  path: routes.about(),
});

/**
 * The «چرا آهن‌تایم؟» advantages — merged in from the former standalone /why
 * page (now redirected here): its 8-item grid was a superset of the 3-item
 * "what we do" list this page used to show, so the two were consolidated into
 * one company page instead of repeating the same pitch on two URLs.
 */
const advantages: Feature[] = [
  {
    title: 'ارزان‌تر، با حذف واسطه',
    desc: 'خرید مستقیم از کارخانه زنجیرهٔ دلال‌ها را کوتاه می‌کند؛ همان کالا، با قیمت منصفانه‌تر.',
    icon: <TagIcon size={22} />,
  },
  {
    title: 'سریع‌تر، تحویل ۲۴ ساعته',
    desc: 'هماهنگی حمل و بارگیری چابک؛ در بیشتر مقاطع پرتقاضا، تحویل در بازهٔ ۲۴ ساعت.',
    icon: <ClockIcon size={22} />,
  },
  {
    title: 'مشاور هوش مصنوعی',
    desc: 'دستیار هوشمند آهن‌تایم پیش از خرید پاسخ می‌دهد؛ انتخاب سایز و گرید، برآورد وزن و هزینه.',
    icon: <AiMarkIcon size={22} />,
    accent: true,
  },
  {
    title: 'قیمت شفاف و به‌روز',
    desc: 'قیمت‌ها لحظه‌ای به‌روزرسانی می‌شود و نوسان، وزن شاخه و زمان تحویل کنار هر کالا روشن است.',
    icon: <ChartIcon size={22} />,
  },
  {
    title: 'تأمین مستقیم از کارخانه',
    desc: 'اصالت کالا و کیفیت استاندارد را با تأمین مستقیم از تولیدکننده تضمین می‌کنیم.',
    icon: <CheckCircleIcon size={22} />,
  },
  {
    title: 'پشتیبانی واقعی',
    desc: 'کارشناسان ما برای نهایی‌سازی پیش‌فاکتور، موجودی و تحویل با شما تماس می‌گیرند؛ انسان واقعی، نه ربات.',
    icon: <PhoneIcon size={22} />,
  },
  {
    title: 'خرید از بورس کالا',
    desc: 'تأمین رسمی از بورس کالای ایران؛ قیمت شفاف، فاکتور معتبر و اصالت تضمین‌شدهٔ محصول.',
    icon: <BankIcon size={22} />,
  },
  {
    title: 'گشایش LC برای مشتریان',
    desc: 'برای خریدهای عمده اعتبار اسنادی (LC) باز می‌کنیم تا معاملهٔ بزرگ شما امن و بی‌دغدغه باشد.',
    icon: <ShieldIcon size={22} />,
    accent: true,
  },
];

export default function AboutPage() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'درباره ما', href: routes.about() },
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

          {/* Why us — advantages merged in from the former /why page */}
          <Stack gap={6}>
            <Stack gap={2}>
              <Heading level={2}>چرا آهن‌تایم؟</Heading>
              <Text color="muted">
                ما واسطه را حذف کردیم، قیمت را شفاف کردیم و مشاوره را پیش از خرید در دسترس
                گذاشتیم تا شما با خیال راحت تصمیم بگیرید.
              </Text>
            </Stack>
            <FeatureGrid items={advantages} />
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
