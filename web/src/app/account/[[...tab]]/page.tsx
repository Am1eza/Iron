import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
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
import { WarehouseList } from '@/components/account/WarehouseList';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { ReorderButton } from '@/components/account/ReorderButton';
import { ClubPanel } from '@/components/account/ClubPanel';
import { ProfileStats } from '@/components/account/ProfileStats';
import { getOrders, getWarehouseItems, getProfileCounts } from '@/lib/server/account';
import { clubStatus } from '@/lib/server/repos/clubRepo';
import { getUserProfile } from '@/lib/server/repos/verificationRepo';
import { API_MODE } from '@/lib/api/config';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import styles from '../account.module.css';

// Every tab is resolved server-side (the `switch` below already knows which
// one is active per request), but a static import of all 7 tab components
// would still bundle them together into one `/account/*` chunk — visiting
// `/account/warehouse` would ship ProfileForm/FavoritesList/AlertsList/etc.
// too. `next/dynamic` (SSR stays on — this is a Server Component, so
// `ssr: false` isn't used/needed here) code-splits each into its own chunk.
const ProfileForm = dynamic(() =>
  import('@/components/auth/ProfileForm').then((m) => m.ProfileForm),
);
const LogoutButton = dynamic(() =>
  import('@/components/auth/LogoutButton').then((m) => m.LogoutButton),
);
const RequestsList = dynamic(() =>
  import('@/components/account/RequestsList').then((m) => m.RequestsList),
);
const DeliveryCity = dynamic(() =>
  import('@/components/account/DeliveryCity').then((m) => m.DeliveryCity),
);
const VerificationCard = dynamic(() =>
  import('@/components/account/VerificationCard').then((m) => m.VerificationCard),
);
const FavoritesList = dynamic(() =>
  import('@/components/account/FavoritesList').then((m) => m.FavoritesList),
);
const AlertsList = dynamic(() =>
  import('@/components/account/AlertsList').then((m) => m.AlertsList),
);

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
  // Return to the SAME tab after login (was routes.account(), which dropped the
  // deep-linked tab — a signed-out visit to /account/club lost the club tab).
  const backTo = slug === 'profile' ? routes.account() : `/account/${slug}`;
  const user = await requireUser(backTo);

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
          <nav aria-label="بخش‌های حساب" className={styles.nav}>
            {TABS.map((t) => {
              const active = t.slug === slug;
              return (
                <Link
                  key={t.slug}
                  href={routes.account(t.slug)}
                  aria-current={active ? 'page' : undefined}
                  className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <TabContent slug={slug} userId={user.id} />
        </Stack>
      </Section>
    </Container>
  );
}

async function TabContent({ slug, userId }: { slug: string; userId: string }) {
  switch (slug) {
    case 'orders': {
      const orders = await getOrders(userId);
      return (
        <Card>
          <Stack gap={6}>
            <div>
              <Heading level={3}>سفارش‌های من</Heading>
              <Text color="muted">وضعیت لحظه‌ای حمل بار هر سفارش را اینجا دنبال کنید.</Text>
            </div>
            <Stack gap={6}>
              {orders.map((o) => {
                const label = SHIPMENT_STEPS.find((s) => s.key === o.status)?.label ?? '';
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
                        <Badge tone={o.status === 'delivered' ? 'gain' : 'accent'}>{label}</Badge>
                      </Cluster>
                      <OrderTimeline status={o.status} />
                      <Cluster justify="space-between" align="center">
                        <Text variant="caption" color="muted">
                          {o.items.map((it) => it.name).join('، ')} ({toPersianDigits(o.items.length)}{' '}
                          ردیف)
                        </Text>
                        <ReorderButton items={o.items} />
                      </Cluster>
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
            <WarehouseList items={await getWarehouseItems(userId)} />
          </Stack>
        </Card>
      );
    case 'favorites':
      return (
        <Card>
          {API_MODE === 'live' ? (
            <FavoritesList />
          ) : (
            <EmptyState size="section" {...emptyPresets.favoritesEmpty()} />
          )}
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
          {API_MODE === 'live' ? (
            <AlertsList />
          ) : (
            <EmptyState size="section" {...emptyPresets.alertsEmpty()} />
          )}
        </Card>
      );
    case 'club': {
      // Live: the real member panel (tier, points, progress, perks, invite) —
      // fed by clubStatus() server-side, so NO client fetch to 401 and no
      // "please log in again" loop. Dev/mock (no DB): a static CTA.
      if (API_MODE !== 'live') {
        return (
          <Card>
            <EmptyState
              size="section"
              headline="باشگاه آهن‌تایم"
              body="با عضویت، قیمت ویژه، تحویل اولویت‌دار و مشاور اختصاصی بگیرید."
              primary={{ label: 'مشاهدهٔ باشگاه', href: routes.club() }}
            />
          </Card>
        );
      }
      const [status, profile] = await Promise.all([clubStatus(userId), getUserProfile(userId)]);
      return (
        <Card>
          <ClubPanel status={status} inviteCode={profile?.inviteCode} />
        </Card>
      );
    }
    default: {
      // Real overview counts + verification state (live). getProfileCounts and
      // getUserProfile both no-op-safe in mock mode (counts fall back to
      // fixtures; profile is null → verification card hidden).
      const [counts, profile] = await Promise.all([
        getProfileCounts(userId),
        API_MODE === 'live' ? getUserProfile(userId) : Promise.resolve(null),
      ]);
      return (
        <Stack gap={4}>
          <ProfileStats
            openRequests={counts.openRequests}
            activeOrders={counts.activeOrders}
            warehouseItems={counts.warehouseItems}
          />
          {profile ? (
            <VerificationCard
              level={profile.verificationLevel}
              idStatus={profile.idVerifyStatus}
              bizStatus={profile.bizVerifyStatus}
            />
          ) : null}
          <DeliveryCity />
          <Card>
            <Stack gap={6}>
              <div>
                <Heading level={3}>اطلاعات حساب</Heading>
                <Text color="muted">
                  نام و نام خانوادگی شما در پیش‌فاکتورها و گفتگو با کارشناس استفاده می‌شود.
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
}
