'use client';
import { useState } from 'react';
import {
  Container,
  Section,
  Stack,
  Cluster,
  Grid,
  Divider,
  Heading,
  Text,
  Overline,
  Button,
  Badge,
  CountBadge,
  Chip,
  Card,
  IconButton,
  Switch,
  Avatar,
  LogoFrame,
  MovementBadge,
  PriceTag,
  DeliveryBadge,
  Tabs,
  TabPanel,
  Breadcrumbs,
  Pagination,
  Alert,
  Tooltip,
  Modal,
  EmptyState,
  emptyPresets,
  Reveal,
  Spinner,
  Skeleton,
  SkeletonText,
  TableSkeleton,
  ThemeToggle,
} from '@/components/ui';
import {
  HeartIcon,
  ChartIcon,
  PrintIcon,
  SheetIcon,
  InfoIcon,
} from '@/components/primitives/icons';
import styles from './styleguide.module.css';

const SWATCHES = [
  ['--color-text-strong', 'متن قوی'],
  ['--color-accent', 'کبالت / هوشمند'],
  ['--color-action', 'کهربا / اقدام'],
  ['--color-gain', 'رشد'],
  ['--color-loss', 'افت'],
  ['--color-surface-sunken', 'سطح فرورفته'],
] as const;

export function StyleGuide() {
  const [tab, setTab] = useState('one');
  const [vat, setVat] = useState(true);
  const [filterSel, setFilterSel] = useState(false);
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(3);

  return (
    <Container>
      <Section space={8}>
        <Cluster justify="space-between">
          <div>
            <Overline>Phase 3 · UI Engineering</Overline>
            <Heading level={1}>راهنمای سیستم طراحی آهن‌تایم</Heading>
          </div>
          <ThemeToggle />
        </Cluster>
        <Text color="muted">
          هر مؤلفه روی توکن‌های طراحی ساخته شده، RTL-native است و حالت‌های hover/press/focus/disabled
          و کاهش حرکت را رعایت می‌کند.
        </Text>
      </Section>

      <Block title="رنگ‌ها (Color Tokens)">
        <Grid min="160px" gap={3}>
          {SWATCHES.map(([token, label]) => (
            <Card key={token} padded={false} className={styles.swatchCard}>
              <span className={styles.swatch} style={{ background: `var(${token})` }} />
              <div className={styles.swatchMeta}>
                <Text variant="label" color="strong">
                  {label}
                </Text>
                <Text variant="micro" color="muted">
                  {token}
                </Text>
              </div>
            </Card>
          ))}
        </Grid>
      </Block>

      <Block title="تایپوگرافی (Typography)">
        <Stack gap={2}>
          <Heading level={1} display>
            نمایش — اول مشورت، بعد خرید
          </Heading>
          <Heading level={2}>سرتیتر ۲ — قیمت میلگرد امروز</Heading>
          <Heading level={3}>سرتیتر ۳</Heading>
          <Text variant="body-lg">متن بزرگ بدنه برای توضیحات مهم.</Text>
          <Text>متن بدنه استاندارد فارسی برای محتوای عمومی صفحه.</Text>
          <Text variant="caption" color="muted">
            کپشن — توضیح کوتاه و کمکی.
          </Text>
        </Stack>
      </Block>

      <Block title="دکمه‌ها (Buttons)">
        <Cluster gap={3}>
          <Button>اقدام اصلی</Button>
          <Button variant="secondary">کبالت</Button>
          <Button variant="ghost">گوست</Button>
          <Button loading>در حال ارسال</Button>
          <Button disabled>غیرفعال</Button>
        </Cluster>
        <Cluster gap={2}>
          <IconButton label="علاقه‌مندی" icon={<HeartIcon size={20} />} />
          <IconButton label="نمودار" icon={<ChartIcon size={20} />} variant="subtle" />
          <IconButton label="چاپ" icon={<PrintIcon size={20} />} />
          <IconButton label="اکسل" icon={<SheetIcon size={20} />} active />
        </Cluster>
      </Block>

      <Block title="بَج‌ها و چیپ‌ها (Badges / Chips)">
        <Cluster gap={2}>
          <Badge tone="accent">هوشمند</Badge>
          <Badge tone="action">پیشنهاد ویژه</Badge>
          <Badge tone="gain" icon={<span aria-hidden>▲</span>}>
            رشد
          </Badge>
          <Badge tone="loss">کهنه</Badge>
          <Badge tone="neutral">A3</Badge>
          <span className={styles.countWrap}>
            سبد <CountBadge count={5} />
          </span>
        </Cluster>
        <Cluster gap={2}>
          <Chip variant="suggestion" onClick={() => {}}>
            قیمت تیرآهن ۱۴؟
          </Chip>
          <Chip variant="filter" selected={filterSel} onClick={() => setFilterSel((v) => !v)}>
            ذوب‌آهن
          </Chip>
          <Chip variant="filter" selected onRemove={() => {}}>
            سایز ۱۴
          </Chip>
        </Cluster>
      </Block>

      <Block title="اجزای قیمت (Price parts)">
        <Cluster gap={6} align="center">
          <PriceTag value={32450} size="hero" />
          <Stack gap={2}>
            <Cluster gap={3}>
              <PriceTag value={32450} />
              <MovementBadge dir="up" pct={0.8} pill />
            </Cluster>
            <Cluster gap={3}>
              <PriceTag value={32100} />
              <MovementBadge dir="down" pct={-0.3} pill />
            </Cluster>
          </Stack>
          <Stack gap={2}>
            <DeliveryBadge value="۲۴ ساعت" />
            <DeliveryBadge value="۴۸ ساعت" guaranteed />
          </Stack>
          <Switch checked={vat} onChange={setVat} label="با ارزش‌افزوده" />
        </Cluster>
      </Block>

      <Block title="ناوبری (Tabs / Breadcrumbs / Pagination)">
        <Breadcrumbs
          items={[
            { label: 'خانه', href: '/' },
            { label: 'قیمت‌ها', href: '/prices' },
            { label: 'میلگرد', href: '/prices/rebar' },
            { label: 'میلگرد ۱۴ A3 ذوب‌آهن' },
          ]}
        />
        <Tabs
          items={[
            { id: 'one', label: 'علاقه‌مندی‌ها', count: 4 },
            { id: 'two', label: 'درخواست‌ها' },
            { id: 'three', label: 'هشدارها', count: 2 },
          ]}
          active={tab}
          onChange={setTab}
          label="نمونه تب‌ها"
        />
        <TabPanel id="one" active={tab}>
          <Text color="muted">محتوای تب علاقه‌مندی‌ها.</Text>
        </TabPanel>
        <TabPanel id="two" active={tab}>
          <Text color="muted">محتوای تب درخواست‌ها.</Text>
        </TabPanel>
        <TabPanel id="three" active={tab}>
          <Text color="muted">محتوای تب هشدارها.</Text>
        </TabPanel>
        <Pagination page={page} pageCount={12} hrefFor={() => '#'} />
        <Cluster gap={2}>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            صفحهٔ قبل (دمو)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(12, p + 1))}>
            صفحهٔ بعد (دمو)
          </Button>
        </Cluster>
      </Block>

      <Block title="بازخورد (Alerts / Tooltip / Modal)">
        <Stack gap={3}>
          <Alert tone="success" title="درخواست ثبت شد">
            کارشناس ما به‌زودی تماس می‌گیرد.
          </Alert>
          <Alert tone="warning" title="قیمت با تأخیر">
            آخرین مقادیر شناخته‌شده نمایش داده می‌شود.
          </Alert>
          <Alert tone="error" dismissible title="خطا در بارگذاری">
            دوباره تلاش کنید.
          </Alert>
        </Stack>
        <Cluster gap={3}>
          <Tooltip content="قیمت بدون ارزش افزوده است">
            <span className={styles.infoTrigger}>
              <InfoIcon size={18} /> راهنما
            </span>
          </Tooltip>
          <Button onClick={() => setModal(true)}>باز کردن مودال</Button>
        </Cluster>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="ثبت هشدار قیمت"
          footer={
            <>
              <Button onClick={() => setModal(false)}>ذخیره هشدار</Button>
              <Button variant="ghost" onClick={() => setModal(false)}>
                انصراف
              </Button>
            </>
          }
        >
          <Text color="muted">
            یک مودال نمونه با تله‌ی فوکوس، بستن با Esc/اسکریم، و بازگشت فوکوس به محرک.
          </Text>
        </Modal>
      </Block>

      <Block title="وضعیت بارگذاری (Loading)">
        <Cluster gap={4} align="center">
          <Spinner label="در حال بارگذاری" />
          <Skeleton variant="circle" width={44} height={44} />
          <div style={{ flex: 1, minInlineSize: 200 }}>
            <SkeletonText lines={3} />
          </div>
        </Cluster>
        <TableSkeleton rows={4} cols={5} />
      </Block>

      <Block title="حالت‌های خالی (Empty States)">
        <Grid min="320px" gap={4}>
          <Card>
            <EmptyState size="section" {...emptyPresets.cartEmpty()} />
          </Card>
          <Card>
            <EmptyState size="section" {...emptyPresets.searchNoResults('میلگرد ۲۰')} />
          </Card>
        </Grid>
      </Block>

      <Block title="حرکت (Animation · Reveal / Avatar)">
        <Reveal>
          <Cluster gap={3} align="center">
            <Avatar name="رضا کریمی" />
            <LogoFrame name="ذوب‌آهن اصفهان" />
            <Text color="muted">این بلوک هنگام ورود به دید، آرام ظاهر می‌شود.</Text>
          </Cluster>
        </Reveal>
      </Block>

      <Divider />
      <Text variant="caption" color="muted" align="center">
        آهن‌تایم — سیستم طراحی · اول مشورت، بعد خرید.
      </Text>
      <div style={{ blockSize: 'var(--space-16)' }} />
    </Container>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Section space={6}>
      <Heading level={3} className={styles.blockTitle}>
        {title}
      </Heading>
      <Stack gap={4}>{children}</Stack>
    </Section>
  );
}
