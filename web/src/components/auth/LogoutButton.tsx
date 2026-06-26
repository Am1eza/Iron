'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/primitives/Button';

/** Logout control — revokes the session (server) then clears client state. */
export function LogoutButton({ redirectTo = '/' }: { redirectTo?: string }) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await logout(redirectTo);
      }}
    >
      خروج از حساب
    </Button>
  );
}
