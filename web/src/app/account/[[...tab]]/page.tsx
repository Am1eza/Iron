import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { requireUser } from '@/lib/auth/guards';
import { canAccessAdmin } from '@/lib/auth/roles';
import { Container, Section, Stack, Card } from '@/components/ui';
import { WarehouseList } from '@/components/account/WarehouseList';
import { OrdersListLive } from '@/components/account/OrdersListLive';
import { ClubPanel } from '@/components/account/ClubPanel';
import { AccountOverview, type OverviewNudge } from '@/components/account/AccountOverview';
import { AccountNav } from '@/components/account/AccountNav';
import { AccountHeader } from '@/components/account/AccountHeader';
import { TabHeading } from '@/components/account/TabHeading';
import { WarehouseTabSub } from '@/components/account/WarehouseTabSub';
import { ClubGuestEmptyState } from '@/components/account/ClubGuestEmptyState';
import { FavoritesMockEmptyState } from '@/components/account/FavoritesMockEmptyState';
import { AlertsMockEmptyState } from '@/components/account/AlertsMockEmptyState';
import { getOrders, getWarehouseItems, getProfileCounts } from '@/lib/server/account';
import { clubStatus, getLetterhead } from '@/lib/server/repos/clubRepo';
import { getUserProfile } from '@/lib/server/repos/verificationRepo';
import { API_MODE } from '@/lib/api/config';
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

// SEO shell metadata: never resolved through next-intl (locale is a client-side
// cookie here, not server-known — see LocaleProvider.tsx) and this route is
// noindex besides, so it stays fa like every other page's metadata this session.
export const metadata: Metadata = buildMetadata({ title: 'حساب من', noindex: true });

/**
 * Account IA (redesigned): overview-first. `/account` lands on a glanceable
 * dashboard (counts, next-step nudges, latest order) instead of a settings
 * form; everything identity/settings-shaped lives under «پروفایل». Desktop
 * gets a vertical icon sidebar (faster scanning, room to grow — nav research);
 * mobile keeps the horizontal pill row. Nav labels/tab headings live in Client
 * Components (AccountNav/AccountHeader/TabHeading) so they can localize — this
 * Server Component's own job is just data-fetching per tab.
 */
type Params = { params: Promise<{ tab?: string[] }> };

export default async function AccountPage({ params }: Params) {
  const { tab } = await params;
  const slug = tab?.[0] ? decodeURIComponent(tab[0]) : '';
  // Return to the SAME tab after login (a signed-out visit to /account/club
  // must come back to the club tab).
  const backTo = slug === '' ? routes.account() : `/account/${slug}`;
  const user = await requireUser(backTo);
  // The session token carries role, not verification state, so the header
  // reads the profile to decide whether this is an approved business account.
  // One PK-indexed select, only in live mode; the tab below may fetch the same
  // profile again, which is cheap enough not to warrant threading it through.
  const headerProfile = API_MODE === 'live' ? await getUserProfile(user.id) : null;
  const isVerifiedBusiness = headerProfile?.bizVerifyStatus === 'approved';

  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <AccountHeader
            name={user.name ?? undefined}
            role={user.role}
            isVerifiedBusiness={isVerifiedBusiness}
            companyName={headerProfile?.companyName ?? undefined}
            canAccessAdmin={canAccessAdmin(user.role)}
          />

          <AccountNav slug={slug} variant="pills" />

          <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <AccountNav slug={slug} variant="side" />
            </aside>
            <div className={styles.content}>
              <TabContent slug={slug} userId={user.id} />
            </div>
          </div>
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
        <TabHeading titleKey="ordersTitle" subKey="ordersSub">
          <Card>
            <OrdersListLive initialOrders={orders} />
          </Card>
        </TabHeading>
      );
    }
    case 'warehouse':
      return (
        <TabHeading titleKey="warehouseTitle" sub={<WarehouseTabSub />}>
          <Card>
            <WarehouseList items={await getWarehouseItems(userId)} />
          </Card>
        </TabHeading>
      );
    case 'favorites':
      return (
        <TabHeading titleKey="favoritesTitle" subKey="favoritesSub">
          <Card>
            {API_MODE === 'live' ? (
              <FavoritesList />
            ) : (
              <FavoritesMockEmptyState />
            )}
          </Card>
        </TabHeading>
      );
    case 'requests':
      return (
        <TabHeading titleKey="requestsTitle" subKey="requestsSub">
          <Card>
            <RequestsList />
          </Card>
        </TabHeading>
      );
    case 'alerts':
      return (
        <TabHeading titleKey="alertsTitle" subKey="alertsSub">
          <Card>
            {API_MODE === 'live' ? <AlertsList /> : <AlertsMockEmptyState />}
          </Card>
        </TabHeading>
      );
    case 'club': {
      if (API_MODE !== 'live') {
        return (
          <TabHeading titleKey="clubTitleGuest">
            <Card>
              <ClubGuestEmptyState />
            </Card>
          </TabHeading>
        );
      }
      const [status, profile] = await Promise.all([clubStatus(userId), getUserProfile(userId)]);
      // Only a پولادی member ever sees the form, so skip the extra query for
      // everyone else.
      const letterhead = status.tier === 'poolad' ? await getLetterhead(userId) : null;
      return (
        <TabHeading titleKey="clubTitleMember">
          <Card>
            <ClubPanel status={status} inviteCode={profile?.inviteCode} letterhead={letterhead} />
          </Card>
        </TabHeading>
      );
    }
    case 'profile': {
      // Pure settings — identity, delivery city, verification, session. The
      // overview owns the dashboard-y parts now.
      const profile = API_MODE === 'live' ? await getUserProfile(userId) : null;
      return (
        <TabHeading titleKey="profileTitle" subKey="profileSub">
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
                verifiedCompanyName={profile.bizVerifyStatus === 'approved' ? profile.companyName : undefined}
              />
            ) : null}
            <div className={styles.logoutRow}>
              <LogoutButton />
            </div>
          </Stack>
        </TabHeading>
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
          nudges.push({ key: 'verify', href: routes.account('profile'), level: profile.verificationLevel + 1 });
        }
      }
      if (club && !club.member) {
        nudges.push({ key: 'club', href: routes.account('club') });
      }

      return <AccountOverview counts={counts} nudges={nudges} lastOrder={orders[0] ?? null} />;
    }
  }
}
