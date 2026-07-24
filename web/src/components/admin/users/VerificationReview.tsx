'use client';
/**
 * «احراز هویت» — the admin KYC/KYB review queue. Lists pending level-2 (کد ملی)
 * and level-3 (business) submissions; approve/reject bumps the user's derived
 * verification level (which can raise their club tier) and is audited.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, EmptyState, Heading, TableSkeleton, Text, useConfirm } from '@/components/ui';
import { Button } from '@/components/primitives/Button';
import ui from '../adminUi.module.css';

export function VerificationReview() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'verifications'],
    queryFn: () => adminApi.verifications(),
  });

  const review = useMutation({
    mutationFn: ({ userId, kind, decision }: { userId: string; kind: 'id' | 'biz'; decision: 'approved' | 'rejected' }) =>
      adminApi.reviewVerification(userId, kind, decision),
    onSuccess: (_res, vars) => {
      toast.success(vars.decision === 'approved' ? 'احراز هویت تأیید شد.' : 'درخواست رد شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت تصمیم ناموفق بود.'),
  });

  const pending = data?.pending ?? [];

  return (
    <section className={ui.panel} aria-labelledby="verif-heading">
      <Heading level={2} id="verif-heading">
        احراز هویت — در انتظار بررسی
        {pending.length > 0 ? <Badge tone="loss">{toPersianDigits(pending.length)}</Badge> : null}
      </Heading>
      <Text color="muted">مدارک ارسالی کاربران را بررسی و تأیید یا رد کنید. تأیید، سطح کاربر و امتیاز باشگاه را ارتقا می‌دهد.</Text>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : isError ? (
        <EmptyState size="section" tone="error" headline="خطا در دریافت صف" primary={{ label: 'تلاش دوباره', onClick: () => refetch() }} />
      ) : pending.length === 0 ? (
        <EmptyState size="inline" headline="موردی برای بررسی نیست 🎉" />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <thead>
            <tr>
              <th>کاربر</th>
              <th>نوع</th>
              <th>اطلاعات</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <tr key={`${p.userId}-${p.kind}`}>
                <td>
                  <span className={ui.mono}>{toPersianDigits(p.mobile)}</span>
                  {p.name ? <div className={ui.muted}>{p.name}</div> : null}
                </td>
                <td>
                  <Badge tone={p.kind === 'biz' ? 'accent' : 'info'}>
                    {p.kind === 'biz' ? 'کسب‌وکار (سطح ۳)' : 'شخصی (سطح ۲)'}
                  </Badge>
                </td>
                <td className={ui.mono}>
                  {p.kind === 'id' ? (
                    <>کد ملی: {toPersianDigits(p.nationalId ?? '—')}</>
                  ) : (
                    <>
                      <div>{p.companyName}</div>
                      <div className={ui.muted}>
                        شناسه: {toPersianDigits(p.companyNationalId ?? '—')} · اقتصادی:{' '}
                        {toPersianDigits(p.economicCode ?? '—')}
                      </div>
                    </>
                  )}
                </td>
                <td>
                  <span className={ui.rowActions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={review.isPending && review.variables?.userId === p.userId && review.variables?.decision === 'approved'}
                      disabled={review.isPending}
                      onClick={() => review.mutate({ userId: p.userId, kind: p.kind, decision: 'approved' })}
                    >
                      تأیید
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={review.isPending && review.variables?.userId === p.userId && review.variables?.decision === 'rejected'}
                      disabled={review.isPending}
                      onClick={async () => {
                        // Rejecting KYC is consequential for the user — never one
                        // accidental click.
                        const ok = await confirm({
                          title: 'رد درخواست احراز هویت؟',
                          body: `درخواست ${p.name ?? toPersianDigits(p.mobile)} رد می‌شود و باید اطلاعات را دوباره ارسال کند.`,
                          confirmLabel: 'رد درخواست',
                        });
                        if (ok) review.mutate({ userId: p.userId, kind: p.kind, decision: 'rejected' });
                      }}
                    >
                      رد
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {dialog}
    </section>
  );
}
