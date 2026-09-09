'use client';
import { useTranslations, useLocale } from 'next-intl';
import { Stack, Grid, Heading, Text, Card } from '@/components/ui';
import { localizeDigits } from '@/lib/utils/format';
import { WarehouseForm } from './WarehouseForm';

const BENEFIT_KEYS = ['security', 'insurance', 'timedSale', 'liquidity'] as const;
const STEP_KEYS = ['register', 'deliverAndContract', 'safeStorage', 'sellAndSettle'] as const;

/**
 * The warehouse landing's translatable body — marketing copy, benefits,
 * steps and the request form. Split out of `warehouse/page.tsx` (a Server
 * Component, kept for its static `metadata` export and fa breadcrumbs — the
 * established SSR-shell exception) so this content can localize client-side.
 */
export function WarehouseLanding() {
  const t = useTranslations('warehousePage');
  const locale = useLocale();

  return (
    <>
      <Stack gap={3}>
        <Text variant="overline" color="accent">
          {t('overline')}
        </Text>
        <Heading level={1}>{t('heading')}</Heading>
        <div style={{ maxInlineSize: '60ch' }}>
          <Text color="muted">{t('lead')}</Text>
        </div>
      </Stack>

      <Grid min="16rem" gap={4}>
        {BENEFIT_KEYS.map((key) => (
          <Card key={key}>
            <Stack gap={2}>
              <Heading level={3}>{t(`benefits.${key}.title`)}</Heading>
              <Text color="muted" variant="body-sm">
                {t(`benefits.${key}.body`)}
              </Text>
            </Stack>
          </Card>
        ))}
      </Grid>

      <Stack gap={4}>
        <Heading level={2}>{t('howItWorksHeading')}</Heading>
        <Grid min="14rem" gap={4}>
          {STEP_KEYS.map((key, i) => (
            <Card key={key}>
              <Stack gap={2}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    inlineSize: '2rem',
                    blockSize: '2rem',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--color-accent-tint)',
                    color: 'var(--color-accent-text)',
                    font: 'var(--t-label)',
                  }}
                >
                  {localizeDigits(i + 1, locale)}
                </span>
                <Heading level={4}>{t(`steps.${key}.title`)}</Heading>
                <Text color="muted" variant="body-sm">
                  {t(`steps.${key}.body`)}
                </Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>

      <Card>
        <Stack gap={5}>
          <Stack gap={1}>
            <Heading level={2}>{t('formHeading')}</Heading>
            <Text color="muted">{t('formLead')}</Text>
          </Stack>
          <WarehouseForm />
        </Stack>
      </Card>
    </>
  );
}
