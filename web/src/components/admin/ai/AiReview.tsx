'use client';
/** AI advisor review + curation — the continuous-improvement loop.
 *  - Review flagged answers (👍/👎) with full conversation context.
 *  - Promote a flagged answer into a curated "golden" correction, which the
 *    advisor then retrieves into its grounded context (searchGuides) so future
 *    similar questions get the vetted answer. This is how it improves over time. */
import { useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, Modal, Switch, TableSkeleton } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

const RATING_FILTERS = [
  { id: '' as const, label: 'همه' },
  { id: 'down' as const, label: '👎 نامفید' },
  { id: 'up' as const, label: '👍 مفید' },
];

type PromoteTarget = { messageId: string | null; answer: string } | null;
type EvalTarget = { conversationId: string | null; messageId: string | null; answer: string } | null;

export function AiReview() {
  const [rating, setRating] = useState<'' | 'up' | 'down'>('down');
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const [promote, setPromote] = useState<PromoteTarget>(null);
  const [evalTarget, setEvalTarget] = useState<EvalTarget>(null);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'ai-feedback', rating],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      adminApi.aiFeedback({ rating: rating || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];
  const summary = data?.pages[0]?.summary;

  return (
    <div>
      {summary && (
        <div className={ui.tiles} style={{ marginBlockEnd: 'var(--space-5)' }}>
          <div className={ui.tile}>
            <div className={ui.tileValue}>{summary.up}</div>
            <div className={ui.tileLabel}>👍 مفید (کل)</div>
          </div>
          <div className={`${ui.tile} ${summary.down > 0 ? ui.tileBad : ''}`}>
            <div className={ui.tileValue}>{summary.down}</div>
            <div className={ui.tileLabel}>👎 نامفید (کل)</div>
          </div>
          <div className={`${ui.tile} ${summary.last7dDown > 0 ? ui.tileBad : ''}`}>
            <div className={ui.tileValue}>{summary.last7dDown}</div>
            <div className={ui.tileLabel}>👎 هفت روز اخیر</div>
          </div>
        </div>
      )}

      <div className={ui.toolbar}>
        {RATING_FILTERS.map((f) => (
          <Chip key={f.id} selected={rating === f.id} onClick={() => setRating(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری بازخوردها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          size="section"
          headline="بازخوردی نیست"
          body="وقتی کاربران روی پاسخ دستیار 👍 یا 👎 بزنند، اینجا نمایش داده می‌شود."
        />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست بازخوردهای ثبت‌شده روی پاسخ‌های دستیار هوشمند</caption>
          <thead>
            <tr>
              <th scope="col">زمان</th>
              <th scope="col">امتیاز</th>
              <th scope="col">پاسخ</th>
              <th scope="col">دلیل</th>
              <th scope="col">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="tnum">{formatJalali(e.createdAt)}</td>
                <td>
                  <Badge tone={e.rating === 'down' ? 'loss' : 'success'}>
                    {e.rating === 'down' ? '👎 نامفید' : '👍 مفید'}
                  </Badge>
                </td>
                <td className={ui.textCell}>{e.answerText ?? <span className={ui.muted}>پاک‌شده</span>}</td>
                <td className={ui.muted}>{e.reason ?? '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {e.conversationId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenConversation((cur) => (cur === e.conversationId ? null : e.conversationId!))}
                      >
                        {openConversation === e.conversationId ? 'بستن' : 'گفتگو'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPromote({ messageId: e.messageId, answer: e.answerText ?? '' })}
                    >
                      ثبت پاسخ درست
                    </Button>
                    {e.rating === 'down' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEvalTarget({ conversationId: e.conversationId, messageId: e.messageId, answer: e.answerText ?? '' })
                        }
                      >
                        علامت‌گذاری برای eval
                      </Button>
                    )}
                  </div>
                  {openConversation === e.conversationId && e.conversationId && (
                    <ConversationThread conversationId={e.conversationId} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasNextPage && (
        <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? 'در حال بارگذاری…' : 'نمایش موارد قدیمی‌تر'}
          </Button>
        </div>
      )}

      <CorrectionsLibrary />
      <EvalCandidatesQueue />

      {promote && (
        <PromoteModal target={promote} onClose={() => setPromote(null)} />
      )}
      {evalTarget && <EvalCandidateModal target={evalTarget} onClose={() => setEvalTarget(null)} />}
    </div>
  );
}

function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'ai-conversation', conversationId],
    queryFn: () => adminApi.aiConversation(conversationId),
  });

  if (isLoading) return <div className={ui.muted}>در حال بارگذاری گفتگو…</div>;
  if (isError || !data) return <div className={ui.muted}>بارگذاری گفتگو ناموفق بود.</div>;

  return (
    <div className={ui.panel} style={{ marginBlockStart: 'var(--space-2)' }}>
      {data.messages.map((m) => (
        <p key={m.id} style={{ margin: '0 0 var(--space-2)' }}>
          <strong>{m.role === 'user' ? 'کاربر' : 'دستیار'}:</strong> {m.content}
        </p>
      ))}
    </div>
  );
}

function PromoteModal({ target, onClose }: { target: NonNullable<PromoteTarget>; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(target.answer);

  const save = useMutation({
    mutationFn: () =>
      adminApi.createCorrection({
        question: question.trim(),
        answer: answer.trim(),
        sourceMessageId: target.messageId ?? undefined,
      }),
    onSuccess: () => {
      toast.success('پاسخ تأییدشده ثبت شد؛ دستیار از این پس آن را در نظر می‌گیرد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-corrections'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت ناموفق بود.'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="ثبت پاسخ تأییدشده (Golden)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={question.trim().length < 3 || answer.trim().length < 3}>
            ثبت
          </Button>
        </>
      }
    >
      <p className={ui.muted} style={{ marginBlockStart: 0 }}>
        سؤال/موضوع را با کلیدواژه‌های اصلی بنویسید و پاسخ درست را ویرایش کنید. دستیار این پاسخ را برای سؤال‌های مشابه بازیابی می‌کند.
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <TextInput
          label="سؤال / موضوع (کلیدواژه‌ها)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="مثلاً: فرق گرید A2 و A3 میلگرد"
        />
        <Textarea label="پاسخ تأییدشده" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
    </Modal>
  );
}

function CorrectionsLibrary() {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ai-corrections'],
    queryFn: () => adminApi.aiCorrections(),
    enabled: open,
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setCorrectionActive(id, isActive),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-corrections'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'تغییر وضعیت ناموفق بود.'),
  });
  const corrections = data?.corrections ?? [];

  return (
    <div style={{ marginBlockStart: 'var(--space-8)' }}>
      <div className={ui.toolbar}>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'بستن کتابخانهٔ پاسخ‌های تأییدشده' : `کتابخانهٔ پاسخ‌های تأییدشده${corrections.length ? ` (${corrections.length})` : ''}`}
        </Button>
      </div>
      {open &&
        (isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : corrections.length === 0 ? (
          <EmptyState size="section" headline="هنوز پاسخ تأییدشده‌ای ثبت نشده" body="از دکمهٔ «ثبت پاسخ درست» روی بازخوردها استفاده کنید." />
        ) : (
          <table className={ui.table}>
            <caption className="visually-hidden">کتابخانهٔ پاسخ‌های تأییدشدهٔ دستیار</caption>
            <thead>
              <tr>
                <th scope="col">سؤال</th>
                <th scope="col">پاسخ</th>
                <th scope="col">فعال</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id}>
                  <td className={ui.textCell}>{c.question}</td>
                  <td className={ui.textCell}>{c.answer}</td>
                  <td>
                    <Switch
                      checked={c.isActive}
                      onChange={(v) => toggle.mutate({ id: c.id, isActive: v })}
                      label="فعال"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}

function EvalCandidateModal({ target, onClose }: { target: NonNullable<EvalTarget>; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      adminApi.createEvalCandidate({
        conversationId: target.conversationId ?? undefined,
        messageId: target.messageId ?? undefined,
        question: question.trim(),
        badAnswer: target.answer,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('برای صف بررسی eval ثبت شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-eval-candidates'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت ناموفق بود.'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="علامت‌گذاری برای سناریوی eval"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={question.trim().length < 3}>
            ثبت در صف
          </Button>
        </>
      }
    >
      <p className={ui.muted} style={{ marginBlockStart: 0 }}>
        این مکالمه مستقیماً به evals.test.ts اضافه نمی‌شود — به صف زیر می‌رود تا یک مهندس AI سناریوی اسکریپت‌شدهٔ واقعی را
        دستی بنویسد (سرویس واقعی اسکریپت‌پذیر نیست، فقط این پایپ‌لاین در تست است).
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <TextInput
          label="سؤال / موضوع"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="مثلاً: قیمت میلگرد سایز نامعتبر"
        />
        <Textarea label="پاسخ نادرست (برای مرجع)" rows={3} value={target.answer} readOnly />
        <Textarea
          label="یادداشت — چه چیزی باید رخ می‌داد؟ (اختیاری)"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

const CANDIDATE_STATUS_LABEL: Record<string, string> = { pending: 'در انتظار', promoted: 'اضافه‌شده', dismissed: 'ردشده' };

function EvalCandidatesQueue() {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ai-eval-candidates'],
    queryFn: () => adminApi.evalCandidates('pending'),
    enabled: open,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'promoted' | 'dismissed' }) => adminApi.setEvalCandidateStatus(id, status),
    onSuccess: () => {
      toast.success('به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'ai-eval-candidates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });
  const candidates = data?.candidates ?? [];

  return (
    <div style={{ marginBlockStart: 'var(--space-8)' }}>
      <div className={ui.toolbar}>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'بستن صف سناریوهای eval' : `صف سناریوهای eval${candidates.length ? ` (${candidates.length})` : ''}`}
        </Button>
      </div>
      {open &&
        (isLoading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : candidates.length === 0 ? (
          <EmptyState
            size="section"
            headline="صف خالی است"
            body="از دکمهٔ «علامت‌گذاری برای eval» روی بازخوردهای 👎 استفاده کنید."
          />
        ) : (
          <table className={ui.table}>
            <caption className="visually-hidden">صف سناریوهای در انتظار تبدیل به eval</caption>
            <thead>
              <tr>
                <th scope="col">سؤال</th>
                <th scope="col">پاسخ نادرست</th>
                <th scope="col">یادداشت</th>
                <th scope="col">تاریخ</th>
                <th scope="col">
                  <span className="visually-hidden">عملیات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td className={ui.textCell}>{c.question}</td>
                  <td className={ui.textCell}>{c.badAnswer}</td>
                  <td className={ui.textCell}>{c.note ?? '—'}</td>
                  <td className="tnum">{formatJalali(c.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus.mutate({ id: c.id, status: 'promoted' })}
                        loading={setStatus.isPending}
                      >
                        {CANDIDATE_STATUS_LABEL.promoted} کردم
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: c.id, status: 'dismissed' })}>
                        رد کن
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
