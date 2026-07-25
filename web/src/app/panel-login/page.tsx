import type { Metadata } from 'next';
import { Suspense } from 'react';
import Image from 'next/image';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/forms/LoginForm';
import styles from './panelLogin.module.css';
import logoMark from '../../../public/brand/ahantime-logo.png';

export const metadata: Metadata = buildMetadata({ title: 'ورود به پنل', noindex: true });

/**
 * The panel host's own entrance. panel.ahantime.com/login is rewritten here
 * by the middleware (see lib/server/utils/panelHost.ts); on the public host
 * this path is hidden (middleware → 404). Unlike /login it renders WITHOUT
 * the storefront chrome — no ticker/navbar/footer, just a focused stage —
 * because the person standing here is staff, not a customer. Wording is
 * deliberately «پنل», not «پنل مدیریت»: experts and operators use it too.
 */
export default function PanelLoginPage() {
  return (
    <div className={`${styles.stage} blueprint`}>
      <div className={styles.card}>
        <div className={styles.head}>
          <Image src={logoMark} alt="" width={64} height={Math.round((logoMark.height / logoMark.width) * 64)} priority />
          <h1 className={styles.title}>به پنل خوش آمدید</h1>
          <p className={styles.subtitle}>ورود کارشناسان آهن‌تایم</p>
        </div>
        <Suspense>
          <LoginForm chromeless />
        </Suspense>
        <a className={styles.siteLink} href="https://ahantime.com">
          رفتن به سایت آهن‌تایم ←
        </a>
      </div>
    </div>
  );
}
