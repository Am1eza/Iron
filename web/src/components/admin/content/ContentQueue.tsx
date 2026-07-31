'use client';
/**
 * Content queue — AI drafts → editor approval → publish/schedule. Selecting a
 * row opens the editor (title/slug/excerpt/bodyMd) with a markdown-lite preview.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi, type ArticleFull } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, TableSkeleton, Tabs, TabPanel, useConfirm } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import { MarkdownProse } from '@/components/content/ArticleBody';
import { JalaliDateField } from '../JalaliDateField';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import ui from '../adminUi.module.css';

/**
 * Cursor-aware markdown insertion for the toolbar (US-12.4) — replaces the
 * current selection (or inserts a placeholder) and restores focus/selection
 * afterward so a second click continues from where the first left off.
 */
function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return { next, selectStart: start + before.length, selectEnd: start + before.length + selected.length };
}

/** Prefixes every line touched by the selection (heading/list toolbar buttons). */
function prefixLines(textarea: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n');
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { next, selectStart: lineStart, selectEnd: lineStart + prefixed.length };
}

const STATUS_TABS = [
  { id: 'draft', label: 'پیش‌نویس' },
  { id: 'scheduled', label: 'زمان‌بندی‌شده' },
  { id: 'published', label: 'منتشرشده' },
];

export function ContentQueue() {
  const [status, setStatus] = useState('draft');
  const [type, setType] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { confirm, dialog: leaveDialog } = useConfirm();
  /**
   * Dirtiness lives HERE, not in ArticleEditor.
   *
   * The editor is keyed by `selectedId`, which is what stops article A's text
   * being written onto article B — but it also means the editor unmounts the
   * instant the selection changes, so it can never guard its own exit. An
   * afternoon of prose used to disappear on a stray row click, a tab switch,
   * or a sidebar link, with no prompt at all.
   */
  const dirtyRef = useRef(false);

  const confirmLeave = useCallback(
    () =>
      confirm({
        title: 'رهاکردن ویرایش؟',
        body: 'متن ذخیره‌نشدهٔ این مقاله از بین می‌رود. ادامه می‌دهید؟',
        confirmLabel: 'رهاکن و ادامه بده',
      }),
    [confirm],
  );

  /** Every path that unmounts the editor routes through here. */
  const guarded = useCallback(
    (apply: () => void) => {
      if (!dirtyRef.current) {
        apply();
        return;
      }
      void confirmLeave().then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          apply();
        }
      });
    },
    [confirmLeave],
  );

  // The admin Command Palette and sidebar navigate with router.push(), which
  // no beforeunload can see — this is the hook that exists for exactly that.
  useUnsavedGuard(true, () => (dirtyRef.current ? confirmLeave() : Promise.resolve(true)));

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'articles', status, type],
    queryFn: () => adminApi.articles({ status, type: type || undefined }),
  });
  const articles = data?.articles ?? [];

  return (
    <div>
      {leaveDialog}
      <Tabs items={STATUS_TABS} active={status} onChange={(s) => guarded(() => { setStatus(s); setSelectedId(null); })} label="وضعیت محتوا" idBase="content" />
      {STATUS_TABS.map((t) => (
        <TabPanel key={t.id} id={t.id} active={status} idBase="content">
          <div style={{ paddingBlockStart: 'var(--space-4)' }}>
            <div className={ui.toolbar}>
              <Chip selected={type === ''} onClick={() => setType('')}>همه</Chip>
              <Chip selected={type === 'blog'} onClick={() => setType('blog')}>وبلاگ</Chip>
              <Chip selected={type === 'news'} onClick={() => setType('news')}>خبر</Chip>
              <NewArticleButton onCreated={(a) => setSelectedId(a.id)} />
            </div>
            {isLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : articles.length === 0 ? (
              <EmptyState size="section" headline="مقاله‌ای نیست" body="با «مقالهٔ جدید» شروع کنید." />
            ) : (
              <div className={ui.tableWrap}><table className={ui.table}>
                <caption className="visually-hidden">فهرست مقاله‌های {STATUS_TABS.find((s) => s.id === status)?.label}</caption>
                <thead>
                  <tr>
                    <th scope="col">عنوان</th>
                    <th scope="col">نوع</th>
                    <th scope="col">منبع</th>
                    <th scope="col">انتشار</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => {
                    const isOpen = selectedId === a.id;
                    const toggle = () => guarded(() => setSelectedId(isOpen ? null : a.id));
                    return (
                    <tr
                      key={a.id}
                      className={ui.rowClickable}
                      onClick={toggle}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isOpen}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <td>
                        {a.title}
                        <div className={`${ui.muted} ${ui.mono}`}>{a.slug}</div>
                      </td>
                      <td>{a.type === 'blog' ? 'وبلاگ' : 'خبر'}</td>
                      <td>
                        {a.source === 'ai' ? <Badge tone="accent">هوش مصنوعی</Badge> : <Badge tone="neutral">تحریریه</Badge>}
                      </td>
                      <td className="tnum">{a.publishAt ? formatJalali(a.publishAt) : '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
            {selectedId ? (
              <ArticleEditor
                key={selectedId}
                id={selectedId}
                onDone={() => {
                  dirtyRef.current = false;
                  setSelectedId(null);
                }}
                onDirtyChange={(d) => {
                  dirtyRef.current = d;
                }}
              />
            ) : null}
          </div>
        </TabPanel>
      ))}
    </div>
  );
}

function NewArticleButton({ onCreated }: { onCreated: (a: ArticleFull) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', type: 'blog' as 'blog' | 'news' });

  const create = useMutation({
    mutationFn: () => adminApi.createArticle(form),
    onSuccess: (res) => {
      toast.success('پیش‌نویس ساخته شد.');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'articles'] });
      onCreated(res.article);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ساخت مقاله ناموفق بود.'),
  });

  if (!open) {
    return (
      <Button size="sm" variant="secondary" style={{ marginInlineStart: 'auto' }} onClick={() => setOpen(true)}>
        مقالهٔ جدید
      </Button>
    );
  }
  return (
    <span className={ui.toolbar} style={{ marginInlineStart: 'auto' }}>
      <input className={ui.textCell} style={{ inlineSize: '12rem' }} placeholder="عنوان" aria-label="عنوان" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={`${ui.textCell} ${ui.mono}`} style={{ inlineSize: '10rem' }} placeholder="slug-latin" aria-label="نشانی (slug)" dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
      <select className={ui.select} value={form.type} aria-label="نوع مقاله" onChange={(e) => setForm({ ...form, type: e.target.value as 'blog' | 'news' })}>
        <option value="blog">وبلاگ</option>
        <option value="news">خبر</option>
      </select>
      <Button size="sm" onClick={() => create.mutate()} disabled={!form.slug || !form.title} loading={create.isPending}>
        ساخت
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        انصراف
      </Button>
    </span>
  );
}

function ArticleEditor({
  id,
  onDone,
  onDirtyChange,
}: {
  id: string;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<Partial<ArticleFull> | null>(null);

  // The parent owns the navigation guards; it only needs to know IF there is
  // unsaved text, never what it is.
  useEffect(() => {
    onDirtyChange(Boolean(draft));
  }, [draft, onDirtyChange]);
  const [schedule, setSchedule] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const applyMd = (fn: (ta: HTMLTextAreaElement) => { next: string; selectStart: number; selectEnd: number }) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const { next, selectStart, selectEnd } = fn(ta);
    setDraft((d) => ({ ...d, bodyMd: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selectStart, selectEnd);
    });
  };

  // Unsaved edits must survive an accidental tab close/reload prompt-free
  // discard (the in-app «ذخیره» button remains the actual save).
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);

  const { data } = useQuery({ queryKey: ['admin', 'article', id], queryFn: () => adminApi.article(id) });
  const article = data?.article;
  const value = { ...article, ...draft } as ArticleFull | undefined;
  // Bylines are picked from content-editor staff — the only role an article
  // can meaningfully be credited to.
  const authors = useQuery({ queryKey: ['admin', 'users', 'authors'], queryFn: () => adminApi.users({ role: 'content' }) });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'articles'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'article', id] });
  };
  const save = useMutation({
    mutationFn: () =>
      adminApi.updateArticle(id, {
        title: value?.title,
        slug: value?.slug,
        excerpt: value?.excerpt ?? null,
        bodyMd: value?.bodyMd,
        coverUrl: value?.coverUrl ?? null,
        authorId: value?.authorId ?? null,
        seo: value?.seo ?? null,
      }),
    onSuccess: () => {
      toast.success('ذخیره شد.');
      setDraft(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.'),
  });
  const publish = useMutation({
    mutationFn: (publishAt?: string) => adminApi.publishArticle(id, publishAt),
    onSuccess: (res) => {
      toast.success(res.article.status === 'published' ? 'منتشر شد.' : 'زمان‌بندی شد.');
      invalidate();
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'انتشار ناموفق بود.'),
  });
  const unpublish = useMutation({
    mutationFn: () => adminApi.updateArticle(id, { status: 'draft' }),
    onSuccess: () => {
      toast.success('به پیش‌نویس بازگشت.');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'لغو انتشار ناموفق بود.'),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteArticle(id),
    onSuccess: () => {
      toast.success('پیش‌نویس حذف شد.');
      invalidate();
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'حذف ناموفق بود.'),
  });

  if (!value) return null;

  return (
    <div className={ui.panel}>
      <div className={ui.grid2}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <TextInput label="عنوان" value={value.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <TextInput label="نشانی (slug)" dir="ltr" value={value.slug ?? ''} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          <Textarea label="خلاصه" rows={2} value={value.excerpt ?? ''} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} />
          <ImageUpload
            label="تصویر کاور"
            value={value.coverUrl ?? null}
            onChange={(url) => setDraft({ ...draft, coverUrl: url ?? '' })}
          />
          <div>
            <label className={ui.muted} htmlFor="article-author">
              نویسنده
            </label>
            <br />
            <select
              id="article-author"
              className={ui.select}
              value={value.authorId ?? ''}
              onChange={(e) => setDraft({ ...draft, authorId: e.target.value || null })}
            >
              <option value="">بدون نویسنده</option>
              {(authors.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.mobile}
                </option>
              ))}
            </select>
          </div>
          <TextInput
            label="عنوان سئو (اختیاری — پیش‌فرض: عنوان مقاله)"
            value={value.seo?.title ?? ''}
            onChange={(e) => setDraft({ ...draft, seo: { ...value.seo, title: e.target.value } })}
          />
          <Textarea
            label="توضیحات سئو (اختیاری — پیش‌فرض: خلاصه)"
            rows={2}
            value={value.seo?.description ?? ''}
            onChange={(e) => setDraft({ ...draft, seo: { ...value.seo, description: e.target.value } })}
          />
          <ImageUpload
            label="تصویر Open Graph (اختیاری — پیش‌فرض: تصویر کاور)"
            value={value.seo?.ogImage ?? null}
            onChange={(url) => setDraft({ ...draft, seo: { ...value.seo, ogImage: url ?? undefined } })}
          />
          <div>
            <div className={ui.toolbar} style={{ marginBlockEnd: 'var(--space-1)' }}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => applyMd((ta) => wrapSelection(ta, '**', '**', 'متن پررنگ'))}
              >
                پررنگ
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '## '))}>
                عنوان
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '- '))}>
                فهرست
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => applyMd((ta) => wrapSelection(ta, '[', '](https://)', 'متن پیوند'))}
              >
                پیوند
              </Button>
            </div>
            <Textarea
              ref={bodyRef}
              label="متن (Markdown)"
              rows={14}
              style={{ fontFamily: 'monospace' }}
              value={value.bodyMd ?? ''}
              onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
            />
          </div>
        </div>
        <div>
          <div className={ui.toolbar}>
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!draft}>
              ذخیره
            </Button>
            {value.status === 'draft' ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={publish.isPending}
                  onClick={() =>
                    // Publishing is public + SEO-affecting — and must never
                    // silently drop unsaved edits (publish sends the SAVED
                    // version, not the in-progress draft).
                    void confirm({
                      title: 'انتشار مقاله؟',
                      body: draft
                        ? 'تغییرات ذخیره‌نشده دارید — اول «ذخیره» را بزنید، وگرنه نسخهٔ قبلی منتشر می‌شود. ادامه می‌دهید؟'
                        : `«${value.title}» همین حالا در سایت منتشر می‌شود.`,
                      confirmLabel: 'انتشار',
                    }).then((ok) => {
                      if (ok) publish.mutate(undefined);
                    })
                  }
                >
                  انتشار اکنون
                </Button>
                {/* Jalali date + local time — replaces the Gregorian
                    datetime-local picker (a fully-Jalali panel popped a
                    Gregorian calendar for scheduling). */}
                <JalaliDateField value={schedule} onChange={setSchedule} label="تاریخ انتشار (شمسی)" />
                <input
                  type="time"
                  className={ui.textCell}
                  style={{ inlineSize: '6rem' }}
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  aria-label="ساعت انتشار"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!schedule}
                  loading={publish.isPending}
                  onClick={() => {
                    // The publish endpoint treats a past date as "publish now",
                    // and this button used to fire straight into it with no
                    // confirm, no pending state and no warning about unsaved
                    // text — then closed the panel, taking the draft with it.
                    const at = new Date(`${schedule}T${scheduleTime || '09:00'}:00`);
                    if (Number.isNaN(at.getTime())) {
                      toast.error('تاریخ یا ساعت انتشار معتبر نیست.');
                      return;
                    }
                    if (at.getTime() <= Date.now()) {
                      toast.error('زمان انتشار باید در آینده باشد؛ برای انتشار فوری از «انتشار اکنون» استفاده کنید.');
                      return;
                    }
                    void confirm({
                      title: 'زمان‌بندی انتشار؟',
                      body: draft
                        ? 'تغییرات ذخیره‌نشده دارید — اول «ذخیره» را بزنید، وگرنه نسخهٔ قبلی زمان‌بندی می‌شود. ادامه می‌دهید؟'
                        : `«${value.title}» در ${formatJalali(at)} به‌صورت خودکار منتشر می‌شود.`,
                      confirmLabel: 'زمان‌بندی',
                    }).then((ok) => {
                      if (ok) publish.mutate(at.toISOString());
                    });
                  }}
                >
                  زمان‌بندی
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={remove.isPending}
                  onClick={() =>
                    void confirm({
                      title: 'حذف پیش‌نویس',
                      body: 'این پیش‌نویس برای همیشه حذف می‌شود. ادامه؟',
                      confirmLabel: 'حذف کن',
                    }).then((ok) => {
                      if (ok) remove.mutate();
                    })
                  }
                >
                  حذف
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                loading={unpublish.isPending}
                onClick={() =>
                  // Publishing asks for confirmation; taking a live, indexed
                  // page back down did not — despite being the destructive
                  // half of the pair.
                  void confirm({
                    title: 'لغو انتشار؟',
                    body: `«${value.title}» از سایت برداشته می‌شود و نشانی‌اش دیگر باز نمی‌شود. اگر گوگل آن را ثبت کرده باشد، نتیجه‌اش هم از دسترس خارج می‌شود. مقاله به پیش‌نویس برمی‌گردد و هر زمان می‌توانید دوباره منتشرش کنید.`,
                    confirmLabel: 'لغو انتشار',
                  }).then((ok) => {
                    if (ok) unpublish.mutate();
                  })
                }
              >
                لغو انتشار
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
              {preview ? 'ویرایش' : 'پیش‌نمایش'}
            </Button>
          </div>
          {preview ? (
            <div className={ui.panel}>
              {/* The exact renderer the published article page uses — a
                  hand-rolled preview here once dropped bold/links, so what the
                  editor saw was not what readers got. */}
              <MarkdownProse md={value.bodyMd ?? ''} />
            </div>
          ) : (
            <p className={ui.muted}>
              وضعیت: {value.status === 'draft' ? 'پیش‌نویس' : value.status === 'scheduled' ? 'زمان‌بندی‌شده' : 'منتشرشده'}
              {value.publishAt ? ` · انتشار: ${formatJalali(value.publishAt)}` : ''}
            </p>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
}
