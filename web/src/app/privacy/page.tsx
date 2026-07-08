import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { getContact, type SiteContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs, Alert } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/company/PageHero';
import { LegalDoc, type LegalSection } from '@/components/company/LegalDoc';
import { toPersianDigits } from '@/lib/utils/format';

export const metadata: Metadata = buildMetadata({
  title: 'حریم خصوصی',
  description:
    'سیاست حریم خصوصی آهن‌تایم؛ چه اطلاعاتی جمع‌آوری می‌کنیم، چگونه از آن استفاده می‌کنیم، ارسال پیامک از طریق کاوه‌نگار و حقوق شما. ما داده‌های شما را نمی‌فروشیم.',
  path: routes.privacy(),
});

const buildSections = (CONTACT: SiteContact): LegalSection[] => [
  {
    id: 'intro',
    title: 'مقدمه',
    body: (
      <p>
        حفظ حریم خصوصی شما برای ما اهمیت دارد. این سند توضیح می‌دهد آهن‌تایم چه اطلاعاتی
        را، چرا و چگونه جمع‌آوری و استفاده می‌کند و شما چه حقوقی نسبت به داده‌های خود
        دارید. ما تنها اطلاعات لازم برای ارائهٔ خدمات استعلام را گردآوری می‌کنیم.
      </p>
    ),
  },
  {
    id: 'collect',
    title: 'چه اطلاعاتی جمع‌آوری می‌کنیم',
    body: (
      <ul>
        <li>
          <strong>شمارهٔ موبایل</strong>: برای ثبت درخواست استعلام، احراز هویت با کد تأیید
          (OTP) و تماس کارشناسان جهت نهایی‌سازی پیش‌فاکتور.
        </li>
        <li>
          <strong>اطلاعات درخواست</strong>: فهرست کالاهای افزوده‌شده به سبد استعلام و
          مشخصات موردنیاز برای ارائهٔ قیمت و تحویل.
        </li>
        <li>
          <strong>داده‌های فنی پایه</strong>: اطلاعات معمول مرورگر و دستگاه برای حفظ
          امنیت، عملکرد صحیح و بهبود تجربهٔ کاربری.
        </li>
      </ul>
    ),
  },
  {
    id: 'use',
    title: 'نحوهٔ استفاده از اطلاعات',
    body: (
      <ul>
        <li>پاسخ به درخواست استعلام و تماس برای اعلام قیمت، موجودی و زمان تحویل.</li>
        <li>ارسال کد تأیید و اطلاع‌رسانی‌های مرتبط با درخواست شما.</li>
        <li>بهبود کیفیت خدمات، قیمت‌گذاری و تجربهٔ استفاده از پلتفرم.</li>
      </ul>
    ),
  },
  {
    id: 'sms',
    title: 'ارسال پیامک',
    body: (
      <p>
        ارسال پیامک‌های آهن‌تایم (مانند کد تأیید و اطلاع‌رسانی درخواست) از طریق سرویس
        پیام‌رسان <strong>کاوه‌نگار</strong> انجام می‌شود. تنها داده‌های لازم برای ارسال
        پیامک (شمارهٔ موبایل و متن مرتبط) در اختیار این سرویس قرار می‌گیرد.
      </p>
    ),
  },
  {
    id: 'no-sale',
    title: 'عدم فروش داده',
    body: (
      <p>
        ما اطلاعات شخصی شما را <strong>نمی‌فروشیم</strong> و آن را در ازای دریافت وجه با
        اشخاص ثالث به اشتراک نمی‌گذاریم. داده‌ها تنها در حدی که برای ارائهٔ خدمات یا الزام
        قانونی ضروری است استفاده می‌شوند.
      </p>
    ),
  },
  {
    id: 'security',
    title: 'نگهداری و امنیت',
    body: (
      <p>
        اطلاعات شما با تدابیر فنی و سازمانی متعارف نگهداری می‌شود و تنها تا زمانی که برای
        اهداف یادشده یا الزامات قانونی لازم باشد، حفظ می‌گردد. دسترسی به داده‌ها محدود به
        افراد مجاز است.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'حقوق کاربر',
    body: (
      <ul>
        <li>درخواست مشاهده یا اصلاح اطلاعاتی که از شما نگهداری می‌شود.</li>
        <li>درخواست حذف داده‌ها، در چارچوب الزامات قانونی و اجرایی.</li>
        <li>انصراف از دریافت پیام‌های اطلاع‌رسانی غیرضروری.</li>
      </ul>
    ),
  },
  {
    id: 'contact',
    title: 'تماس',
    body: (
      <p>
        برای اعمال حقوق خود یا هر پرسش دربارهٔ حریم خصوصی می‌توانید با شمارهٔ ثابت{' '}
        <a href={`tel:${CONTACT.phoneLandline}`}>
          <bdi>{toPersianDigits(CONTACT.phoneLandline)}</bdi>
        </a>{' '}
        یا همراه{' '}
        <a href={`tel:${CONTACT.phoneMobile}`}>
          <bdi>{toPersianDigits(CONTACT.phoneMobile)}</bdi>
        </a>{' '}
        با ما در تماس باشید.
      </p>
    ),
  },
];

export default async function PrivacyPage() {
  const CONTACT = await getContact();
  const sections = buildSections(CONTACT);
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'حریم خصوصی' },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="privacy-title">
        <Stack gap={8}>
          <Stack gap={6}>
            <Breadcrumbs items={crumbs} />
            <PageHero
              id="privacy-title"
              eyebrow="حقوقی"
              title="حریم خصوصی"
              lead="ما تنها اطلاعات لازم برای ارائهٔ خدمات استعلام را جمع‌آوری می‌کنیم و داده‌های شما را نمی‌فروشیم."
            />
            <Alert tone="info" title="کمترین داده، بیشترین احترام">
              برای استفاده از قیمت‌ها نیازی به ثبت‌نام نیست؛ شمارهٔ موبایل تنها در زمان ثبت
              درخواست استعلام و برای کد تأیید دریافت می‌شود.
            </Alert>
          </Stack>

          <LegalDoc sections={sections} updatedLabel="آخرین به‌روزرسانی: تیر ۱۴۰۵" />
        </Stack>
      </Section>
    </Container>
  );
}
