'use client';
/** Contact-form inbox — mark messages handled, reply-in-place, reopen (US-19.5). */
import { Fragment, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, EmptyState, TableSkeleton } from '@/components/ui';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

type Message = {
  id: string;
  name: string;
  mobile: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

function ReplyRow({ message }: { message: Message }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'contact-messages'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };
  const reply = useMutation({
    mutationFn: () => adminApi.replyToContactMessage(message.id, text.trim()),
    onSuccess: () => {
      toast.success('پاسخ پیامک شد.');
      setReplying(false);
      setText('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ارسال پاسخ ناموفق بود.'),
  });
  const reopen = useMutation({
    mutationFn: () => adminApi.updateContactMessage(message.id, 'new'),
    onSuccess: () => {
      toast.success('پیام دوباره باز شد.');
      invalidate();
    },
    onError: () => toast.error('بازگشایی ناموفق بود.'),
  });

  return (
    <tr>
      <td colSpan={4}>
        {message.reply ? (
          <p className={ui.muted}>
            پاسخ شما ({formatJalali(message.repliedAt ?? message.createdAt)}): {message.reply}
          </p>
        ) : null}
        {replying ? (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <textarea
              className={ui.textCell}
              style={{ inlineSize: '100%', minBlockSize: '4rem' }}
              placeholder="متن پاسخ (پیامک می‌شود)…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={`پاسخ به ${message.name}`}
            />
            <div className={ui.toolbar}>
              <Button size="sm" onClick={() => reply.mutate()} disabled={!text.trim()} loading={reply.isPending}>
                ارسال پاسخ
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
                انصراف
              </Button>
            </div>
          </div>
        ) : (
          <div className={ui.toolbar}>
            <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
              {message.reply ? 'ارسال پاسخ دیگر' : 'پاسخ درجا'}
            </Button>
            {message.status === 'handled' ? (
              <Button size="sm" variant="ghost" onClick={() => reopen.mutate()} loading={reopen.isPending}>
                بازگشایی
              </Button>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  );
}

export function MessagesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'contact-messages', page],
    queryFn: () => adminApi.contactMessages({ page, perPage: PER_PAGE }),
  });
  const handle = useMutation({
    mutationFn: (id: string) => adminApi.updateContactMessage(id, 'handled'),
    onSuccess: () => {
      toast.success('پیام رسیدگی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-messages'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: () => toast.error('به‌روزرسانی ناموفق بود.'),
  });

  const messages = data?.messages ?? [];

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : messages.length === 0 ? (
        <EmptyState size="section" headline="پیامی نیست" body="پیام‌های فرم تماس اینجا می‌آید." />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست پیام‌های فرم تماس</caption>
          <thead>
            <tr>
              <th scope="col">فرستنده</th>
              <th scope="col">پیام</th>
              <th scope="col">تاریخ</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <Fragment key={m.id}>
                <tr>
                  <td>
                    {m.name}
                    <div className={`${ui.muted} tnum`}>{toPersianDigits(m.mobile)}</div>
                  </td>
                  <td style={{ maxInlineSize: '28rem' }}>{m.message}</td>
                  <td className="tnum">{formatJalali(m.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                      {m.status === 'new' ? (
                        <Button size="sm" variant="secondary" onClick={() => handle.mutate(m.id)} loading={handle.isPending}>
                          رسیدگی شد
                        </Button>
                      ) : (
                        <Badge tone="neutral">رسیدگی‌شده</Badge>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                        {openId === m.id ? 'بستن' : 'پاسخ'}
                      </Button>
                    </div>
                  </td>
                </tr>
                {openId === m.id ? <ReplyRow message={m} /> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} پیام</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
