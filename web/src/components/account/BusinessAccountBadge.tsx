import { BUSINESS_ACCOUNT_LABEL } from '@/lib/data/verification';
import { Badge } from '@/components/ui';
import { ShieldIcon } from '@/components/primitives/icons';

/**
 * «حساب سازمانی تأییدشده» — the one visible mark of an APPROVED business
 * (level-3) account. The status already existed in `users.biz_verify_status`
 * and was approved by an admin, but nothing ever showed it back to the
 * customer, so verification felt like a form that led nowhere.
 *
 * Deliberately a plain `success` Badge, not a new visual treatment: green is
 * allowed here because it IS data (a verified state), and the amber action
 * slot on every one of these screens is already spoken for.
 *
 * The company name is shown next to it when we have it — it is the whole
 * point of the level-3 record, and seeing their own شرکت on the account is
 * what makes the state feel real.
 */
export function BusinessAccountBadge({ companyName }: { companyName?: string }) {
  return (
    <Badge tone="success" icon={<ShieldIcon size={13} />}>
      {companyName?.trim() ? `${BUSINESS_ACCOUNT_LABEL} · ${companyName.trim()}` : BUSINESS_ACCOUNT_LABEL}
    </Badge>
  );
}
