import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { requireUser } from '@/lib/auth/guards';
import { canAccessAdmin, ROLE_LABEL } from '@/lib/auth/roles';
import {
  Container,
  Section,
  Stack,
  Cluster,
  Heading,
  Text,
  Card,
  Badge,
  EmptyState,
  emptyPresets,
} from '@/components/ui';
import { ProfileForm } from '@/components/auth/ProfileForm';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { WarehouseList } from '@/components/account/WarehouseList';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { RequestsList } from '@/components/account/RequestsList';
import { ProfileStats } from '@/components/account/ProfileStats';
import { getWarehouseItems } from '@/lib/mock/warehouse';
import { getOrders } from '@/lib/mock/orders';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';

export const metadata: Metadata = buildMetadata({ title: 'حساب من', noindex: true });

const TABS = [
  { slug: 'profile', label: 'پروفایل' },
  { slug: 'orders', label: 'سفارش‌ها' },
  { slug: 'warehouse', label: 'انبار من' },
  { slug: 'favorites', label: 'علاقه‌مندی‌ها' },
  { slug: 'requests', label: 'درخواست‌ها' },
  { slug: 'alerts', label: 'هشدارها' },
  { slug: 'club', label: 'باشگاه' },
] as const;

type Params = { params: Promise<{ tab?: string[] }> };

export default async function AccountPage({ params }: Params) {
  const { tab } = await params;
  const slug = tab?.[0] ? decodeURIComponent(tab[0]) : 'profile';
  const user = await requireUser(routes.account());

  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Cluster justify="space-between" align="flex-start">
            <div>
              <Text variant="overline" color="accent">
                حساب من
              </Text>
              <Heading level={1}>سلام{user.name ? `، ${user.name}` : ''}</Heading>
            </div>
            <Cluster gap={2}>
              <Badge tone="neutral">{ROLE_LABEL[user.role]}</Badge>
              {canAccessAdmin(user.role) ? (
                <Link href={routes.admin.dashboard()}>
                  <Badge tone="accent">پنل مدیریت</Badge>
                </Link>
              ) : null}
            </Cluster>
          </Cluster>

          {/* Deep-linkable section nav */}
          <nav aria-label="بخش‌های حساب">
           <Cluster gap={2}>
            {TABS.map((t) => {
              const active = t.slug === slug;
              return (
                <Link
                  key={t.slug}
                  href={routes.account(t.slug)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'inline-flex',
                    minBlockSize: 40,
                    alignItems: 'center',
                    paddingInline: 'var(--space-4)',
                    borderRadius: 'var(--radius-pill)',
                    font: 'var(--t-label)',
                    textDecoration: 'none',
                    background: active
                      ? 'var(--color-accent-tint)'
                      : 'var(--color-surface-sunken)',
                    color: active ? 'var(--color-accent-text)' : 'var(--color-text)',
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
           </Cluster>
          </nav>

          <TabContent slug={slug} />
        </Stack>
      </Section>
    </Container>
  );
}

function TabContent({ slug }: { slug: string }) {
  switch (slug) {
    case 'orders': {
      const orders = getOrders();
      return (
        <Card>
          <Stack gap={6}>
            <div>
              <Heading level={3}>سفارش‌های من</Heading>
              <Text color="muted">وضعیت لحظه‌ای حمل بار هر سفارش را اینجا دنبال کنید.</Text>
            </div>
            <Stack gap={6}>
              {orders.map((o) => {
                const label =
                  SHIPMENT_STEPS.find((s) => s.key === o.status)?.label ?? '';
                return (
                  <div
                    key={o.ref}
                    style={{
                      border: 'var(--border-hairline) solid var(--color-hairline)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                    }}
                  >
                    <Stack gap={4}>
                      <Cluster justify="space-between" align="flex-start">
                        <Stack gap={1}>
                          <Text variant="label" color="strong" as="span">
                            سفارش <bdi>{o.ref}</bdi>
                          </Text>
                          <Text variant="caption" color="muted">
                            ثبت: {formatJalali(o.placedAt)} · آخرین به‌روزرسانی:{' '}
                            {formatJalali(o.lastUpdate)}
                          </Text>
                        </Stack>
                        <Badge tone={o.status === 'delivered' ? 'gain' : 'accent'}>
                          {label}
                        </Badge>
                      </Cluster>
                      <OrderTimeline status={o.status} />
                      <Text variant="caption" color="muted">
                        {o.items.map((it) => it.name).join('، ')} ({toPersianDigits(o.items.length)}{' '}
                        ردیف)
                      </Text>
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      );
    }
    case 'warehouse':
      return (
        <Card>
          <Stack gap={6}>
            <div>
              <Heading level={3}>انبار من</Heading>
              <Text color="muted">
                کالاهای امانی شما نزد آهن‌تایم. برای ثبت کالای جدید به{' '}
                <Link href={routes.warehouse()}>صفحهٔ انبار مشتریان</Link> بروید.
              </Text>
            </div>
            <WarehouseList items={getWarehouseItems()} />
          </Stack>
        </Card>
      );
    case 'favorites':
      return (
        <Card>
          <EmptyState size="section" {...emptyPresets.favoritesEmpty()} />
        </Card>
      );
    case 'requests':
      return (
        <Card>
          <Stack gap={6}>
            <div>
              <Heading level={3}>درخواست‌های من</Heading>
              <Text color="muted">
                پیش‌فاکتورها، خرید عمده و درخواست‌های انبار — با وضعیت لحظه‌ای هرکدام.
              </Text>
            </div>
            <RequestsList />
          </Stack>
        </Card>
      );
    case 'alerts':
      return (
        <Card>
          <EmptyState size="section" {...emptyPresets.alertsEmpty()} />
        </Card>
      );
    case 'club':
      return (
        <Card>
          <EmptyState
            size="section"
            headline="باشگاه آهن‌تایم"
            body="با عضویت، قیمت ویژه، تحویل اولویت‌دار و مشاور اختصاصی بگیرید."
            primary={{ label: 'عضویت در باشگاه', href: routes.club() }}
          />
        </Card>
      );
    default:
      return (
        <Stack gap={4}>
          <ProfileStats />
          <Card>
            <Stack gap={6}>
              <div>
                <Heading level={3}>اطلاعات حساب</Heading>
                <Text color="muted">
                  نام نمایشی شما در پیش‌فاکتورها و گفتگو با کارشناس استفاده می‌شود.
                </Text>
              </div>
              <ProfileForm />
              <LogoutButton />
            </Stack>
          </Card>
        </Stack>
      );
  }
}
