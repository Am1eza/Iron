'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';

/** The warehouse tab's sub-copy embeds a link mid-sentence, so it needs
 *  `t.rich` (a plain `t()` string can't carry a real `<Link>`). */
export function WarehouseTabSub() {
  const t = useTranslations('account.tabs');
  return (
    <>
      {t.rich('warehouseSub', {
        link: (chunks) => <Link href={routes.warehouse()}>{chunks}</Link>,
      })}
    </>
  );
}
