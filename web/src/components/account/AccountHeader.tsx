'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Role } from '@/lib/auth/types';
import { Cluster, Text, Heading, Badge } from '@/components/ui';
import { BusinessAccountBadge } from './BusinessAccountBadge';

export function AccountHeader({
  name,
  role,
  isVerifiedBusiness,
  companyName,
  canAccessAdmin,
}: {
  name?: string;
  role: Role;
  isVerifiedBusiness: boolean;
  companyName?: string;
  canAccessAdmin: boolean;
}) {
  const t = useTranslations('account.header');
  const tRole = useTranslations('account.roleLabel');
  return (
    <Cluster justify="space-between" align="flex-start">
      <div>
        <Text variant="overline" color="accent">
          {t('overline')}
        </Text>
        <Heading level={1}>{name ? t('greetingWithName', { name }) : t('greetingNoName')}</Heading>
      </div>
      <Cluster gap={2}>
        {isVerifiedBusiness ? <BusinessAccountBadge companyName={companyName} /> : null}
        <Badge tone="neutral">{tRole(role)}</Badge>
        {canAccessAdmin ? (
          <Link href="https://panel.ahantime.com">
            <Badge tone="accent">{t('adminPanelBadge')}</Badge>
          </Link>
        ) : null}
      </Cluster>
    </Cluster>
  );
}
