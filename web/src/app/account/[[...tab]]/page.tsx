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

export const metadata: Metadata = buildMetadata({ title: 'حساب من', noindex: true });

const TABS = [
  { slug: 'profile', label: 'پروفایل' },
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
              <Heading level={1}>سلام{user.name ? `، ${user.name}` : ''} 👋</Heading>
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
    case 'favorites':
      return (
        <Card>
          <EmptyState size="section" {...emptyPresets.favoritesEmpty()} />
        </Card>
      );
    case 'requests':
      return (
        <Card>
          <EmptyState size="section" {...emptyPresets.requestsEmpty()} />
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
      );
  }
}
