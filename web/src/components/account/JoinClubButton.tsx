'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { http } from '@/lib/api/http';
import { Button } from '@/components/primitives/Button';
import { trackGoal } from '@/lib/analytics/track';

/** One-tap join → POST /api/me/club, then refresh so the server re-renders the
 *  full member panel. No page navigation, no login prompt (already signed in). */
export function JoinClubButton() {
  const router = useRouter();
  const t = useTranslations('account.club');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      await http.post('/api/me/club', {});
      trackGoal('club', 'club_join');
      router.refresh();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Button onClick={join} loading={busy}>
      {t('joinCta')}
    </Button>
  );
}
