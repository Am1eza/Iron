import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { requireUser } from '@/lib/auth/guards';
import { canAccessAdmin, ROLE_LABEL } from '@/lib/auth/roles';
import { Container, Section, Stack, Cluster, Heading, Text, Card, Badge, EmptyState, emptyPresets } from '@/components/ui';
import {
  HomeIcon,
  CartIcon,
  SheetIcon,
  BankIcon,
  HeartIcon,
  BellIcon,
  StarIcon,
  UserIcon,
} from '@/components/primitives/icons';
import { WarehouseList } from '@/components/account/WarehouseList';
import { OrdersList } from '@/components/account/OrdersList';
import { ClubPanel } from '@/components/account/ClubPanel';
import { AccountOverview, type OverviewNudge } from '@/components/account/AccountOverview';
import { getOrders, getWarehouseItems, getProfileCounts } from '@/lib/server/account';
import { clubStatus } from '@/lib/server/repos/clubRepo';
import { getUserProfile } from '@/lib/server/repos/verificationRepo';
import { API_MODE } from '@/lib/api/config';
import { toPersianDigits } from '@/lib/utils/format';
import styles from '../account.module.css';

// Every tab is resolved server-side (the `switch` below already knows which
// one is active per request), but a static import of all tab components would
// still bundle them together into one `/account/*` chunk. `next/dynamic`
// (SSR stays on — this is a Server Component) code-splits each.
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

/**
 * Account IA (redesigned): overview-first. `/account` lands on a glanceable
 * dashboard (counts, next-step nudges, latest order) instead of a settings
 * form; everything identity/settings-shaped lives under «پروفایل». Desktop
 * gets a vertical icon sidebar (faster scanning, room to grow — nav research);
 * mobile keeps the horizontal pill row.
 */
const TABS = [
  { slug: '', label: 'نمای کلی', icon: HomeIcon },
  { slug: 'orders', label: 'سفارش‌ها', icon: CartIcon },
  { slug: 'requests', label: 'درخواست‌ها', icon: SheetIcon },
  { slug: 'warehouse', label: 'انبار من', icon: BankIcon },
  { slug: 'favorites', label: 'علاقه‌مندی‌ها', icon: HeartIcon },
  { slug: 'alerts', label: 'هشدارها', icon: BellIcon },
  { slug: 'club', label: 'باشگاه', icon: StarIcon },
  { slug: 'profile', label: 'پروفایل و تنظیمات', icon: UserIcon },
] as const;

type Params = { params: Promise<{ tab?: string[] }> };

export default async function AccountPage({ params }: Params) {
  const { tab } = await params;
  const slug = tab?.[0] ? decodeURIComponent(tab[0]) : '';
  // Return to the SAME tab after login (a signed-out visit to /account/club
  // must come back to the club tab).
  const backTo = slug === '' ? routes.account() : `/account/${slug}`;
  const user = await requireUser(backTo);

  const nav = (variant: 'side' | 'pills') => (
    <nav
      aria-label="بخش‌های حساب"
      className={variant === 'side' ? styles.side : styles.nav}
    >
      {TABS.map((t) => {
        const active = t.slug === slug;
        const Icon = t.icon;
        return (
          <Link
            key={t.slug}
            href={t.slug ? routes.account(t.slug) : routes.account()}
            aria-current={active ? 'page' : undefined}
            className={
              variant === 'side'
                ? `${styles.sideItem} ${active ? styles.sideItemActive : ''}`
                : `${styles.tab} ${active ? styles.tabActive : ''}`
            }
          >
            <Icon size={variant === 'side' ? 18 : 16} aria-hidden="true" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );

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
                <Link href="https://panel.ahantime.com">
                  <Badge tone="accent">پنل مدیریت</Badge>
                </Link>
              ) : null}
            </Cluster>
          </Cluster>

          {nav('pills')}

          <div className={styles.layout}>
            <aside className={styles.sidebar}>{nav('side')}</aside>
            <div className={styles.content}>
              <TabContent slug={slug} userId={user.id} />
            </div>
          </div>
        </Stack>
      </Section>
    </Container>
  );
}

/** Consistent per-tab chrome: one heading + optional sub, content below —
 *  no card-in-card nesting. */
function TabSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap={4}>
      <div>
        <Heading level={2} className={styles.tabTitle}>
          {title}
        </Heading>
        {sub ? <Text color="muted">{sub}</Text> : null}
      </div>
      {children}
    </Stack>
  );
}

async function TabContent({ slug, userId }: { slug: string; userId: string }) {
  switch (slug) {
    case 'orders': {
      const orders = await getOrders(userId);
      return (
        <TabSection title="سفارش‌های من" sub="وضعیت لحظه‌ای حمل بار هر سفارش را اینجا دنبال کنید.">
          <Card>
            <OrdersList orders={orders} />
          </Card>
        </TabSection>
      );
    }
    case 'warehouse':
      return (
        <TabSection
          title="انبار من"
          sub={
            <>
              کالاهای امانی شما نزد آهن‌تایم. برای ثبت کالای جدید به{' '}
              <Link href={routes.warehouse()}>صفحهٔ انبار مشتریان</Link> بروید.
            </>
          }
        >
          <Card>
            <WarehouseList items={await getWarehouseItems(userId)} />
          </Card>
        </TabSection>
      );
    case 'favorites':
      return (
        <TabSection title="علاقه‌مندی‌ها" sub="محصولاتی که نشان کرده‌اید — با قیمت لحظه‌ای.">
          <Card>
            {API_MODE === 'live' ? (
              <FavoritesList />
            ) : (
              <EmptyState size="section" {...emptyPresets.favoritesEmpty()} />
            )}
          </Card>
        </TabSection>
      );
    case 'requests':
      return (
        <TabSection
          title="درخواست‌های من"
          sub="پیش‌فاکتورها، خرید عمده و درخواست‌های انبار — با وضعیت لحظه‌ای هرکدام."
        >
          <Card>
            <RequestsList />
          </Card>
        </TabSection>
      );
    case 'alerts':
      return (
        <TabSection title="هشدارهای قیمت" sub="وقتی قیمت به حد تعیین‌شده برسد، پیامک می‌گیرید.">
          <Card>
            {API_MODE === 'live' ? (
              <AlertsList />
            ) : (
              <EmptyState size="section" {...emptyPresets.alertsEmpty()} />
            )}
          </Card>
        </TabSection>
      );
    case 'club': {
      if (API_MODE !== 'live') {
        return (
          <TabSection title="باشگاه آهن‌تایم">
            <Card>
              <EmptyState
                size="section"
                headline="باشگاه آهن‌تایم"
                body="با عضویت، قیمت ویژه، تحویل اولویت‌دار و مشاور اختصاصی بگیرید."
                primary={{ label: 'مشاهدهٔ باشگاه', href: routes.club() }}
              />
            </Card>
          </TabSection>
        );
      }
      const [status, profile] = await Promise.all([clubStatus(userId), getUserProfile(userId)]);
      return (
        <TabSection title="باشگاه مشتریان">
          <Card>
            <ClubPanel status={status} inviteCode={profile?.inviteCode} />
          </Card>
        </TabSection>
      );
    }
    case 'profile': {
      // Pure settings — identity, delivery city, verification, session. The
      // overview owns the dashboard-y parts now.
      const profile = API_MODE === 'live' ? await getUserProfile(userId) : null;
      return (
        <TabSection
          title="پروفایل و تنظیمات"
          sub="نام شما در پیش‌فاکتورها و گفتگو با کارشناس استفاده می‌شود."
        >
          <Stack gap={4}>
            <Card>
              <Stack gap={5}>
                <ProfileForm />
              </Stack>
            </Card>
            <DeliveryCity />
            {profile ? (
              <VerificationCard
                level={profile.verificationLevel}
                idStatus={profile.idVerifyStatus}
                bizStatus={profile.bizVerifyStatus}
              />
            ) : null}
            <div className={styles.logoutRow}>
              <LogoutButton />
            </div>
          </Stack>
        </TabSection>
      );
    }
    default: {
      // «نمای کلی» — counts, at most two next-step nudges, latest order.
      const [counts, profile, club, orders] = await Promise.all([
        getProfileCounts(userId),
        API_MODE === 'live' ? getUserProfile(userId) : Promise.resolve(null),
        API_MODE === 'live' ? clubStatus(userId) : Promise.resolve(null),
        getOrders(userId),
      ]);

      const nudges: OverviewNudge[] = [];
      if (profile && profile.verificationLevel < 3) {
        const pending =
          (profile.verificationLevel === 1 ? profile.idVerifyStatus : profile.bizVerifyStatus) ===
          'pending';
        if (!pending) {
          nudges.push({
            key: 'verify',
            title: 'احراز هویت را کامل کنید',
            body: `با ارتقا به سطح ${toPersianDigits(profile.verificationLevel + 1)}، مزایای بیشتری باز می‌شود.`,
            href: routes.account('profile'),
            cta: 'تکمیل',
          });
        }
      }
      if (club && !club.member) {
        nudges.push({
          key: 'club',
          title: 'به باشگاه مشتریان بپیوندید',
          body: 'عضویت رایگان است؛ با هر سفارش امتیاز بگیرید و سطح‌تان بالا برود.',
          href: routes.account('club'),
          cta: 'عضویت',
        });
      }

      return (
        <AccountOverview counts={counts} nudges={nudges} lastOrder={orders[0] ?? null} />
      );
    }
  }
}
