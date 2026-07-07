'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/http';
import { Button } from '@/components/primitives/Button';

/** One-tap join → POST /api/me/club, then refresh so the server re-renders the
 *  full member panel. No page navigation, no login prompt (already signed in). */
export function JoinClubButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      await http.post('/api/me/club', {});
      router.refresh();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Button onClick={join} loading={busy}>
      عضویت رایگان در باشگاه
    </Button>
  );
}
