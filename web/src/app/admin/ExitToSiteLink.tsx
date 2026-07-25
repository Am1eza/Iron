'use client';
import { useEffect, useState } from 'react';

/**
 * The topbar's «سایت» exit. On panel.ahantime.com a plain `/` would land on
 * the dashboard again (the host rewrite), so after mount the href swaps to
 * the public site's absolute URL. Starts as `/` so SSR and first client
 * render agree (dev/localhost keeps working too).
 */
export function ExitToSiteLink({ className }: { className?: string }) {
  const [href, setHref] = useState('/');
  useEffect(() => {
    if (window.location.hostname === 'panel.ahantime.com') setHref('https://ahantime.com');
  }, []);
  return (
    <a href={href} className={className}>
      سایت
    </a>
  );
}
