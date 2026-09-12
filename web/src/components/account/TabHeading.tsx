'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Heading, Text, Stack } from '@/components/ui';
import styles from '@/app/[locale]/account/account.module.css';

/** Consistent per-tab chrome: one translated heading + optional sub, content
 *  below. Client Component so it can translate — the account page's per-tab
 *  data fetching stays server-side; only this presentational shell moved. */
export function TabHeading({
  titleKey,
  titleParams,
  subKey,
  subParams,
  sub,
  children,
}: {
  titleKey: string;
  titleParams?: Record<string, string | number>;
  subKey?: string;
  subParams?: Record<string, string | number>;
  /** Pre-rendered rich sub content (e.g. one containing a `<Link>`) — takes
   *  precedence over `subKey` when given. */
  sub?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('account.tabs');
  return (
    <Stack gap={4}>
      <div>
        <Heading level={2} className={styles.tabTitle}>
          {t(titleKey, titleParams)}
        </Heading>
        {sub ? <Text color="muted">{sub}</Text> : subKey ? <Text color="muted">{t(subKey, subParams)}</Text> : null}
      </div>
      {children}
    </Stack>
  );
}
