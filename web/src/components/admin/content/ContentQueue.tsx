'use client';
/**
 * Content queue — AI drafts → editor approval → publish/schedule. Selecting a
 * row opens the editor (title/slug/excerpt/bodyMd) with a markdown-lite preview.
 */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi, type ArticleFull } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, TableSkeleton, Tabs, TabPanel } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import ui from '../adminUi.module.css';

const STATUS_TABS = [
  { id: 'draft', label: 'پیش‌نویس' },
  { id: 'scheduled', label: 'زمان‌بندی‌شده' },
  { id: 'published', label: 'منتشرشده' },
];

export function ContentQueue() {
  const [status, setStatus] = useState('draft');
  const [type, setType] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'articles', status, type],
    queryFn: () => adminApi.articles({ status, type: type || undefined }),
  });
  const articles = data?.articles ?? [];

  return (
    <div>
      <Tabs items={STATUS_TABS} active={status} onChange={(s) => { setStatus(s); setSelectedId(null); }} label="وضعیت محتوا" idBase="content" />
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
              <table className={ui.table}>
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
                    const toggle = () => setSelectedId(isOpen ? null : a.id);
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
              </table>
            )}
            {selectedId ? <ArticleEditor key={selectedId} id={selectedId} onDone={() => setSelectedId(null)} /> : null}
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

function ArticleEditor({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<ArticleFull> | null>(null);
  const [schedule, setSchedule] = useState('');
  const [preview, setPreview] = useState(false);

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
          <Textarea
            label="متن (Markdown)"
            rows={14}
            style={{ fontFamily: 'monospace' }}
            value={value.bodyMd ?? ''}
            onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
          />
        </div>
        <div>
          <div className={ui.toolbar}>
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!draft}>
              ذخیره
            </Button>
            <Button size="sm" variant="secondary" onClick={() => publish.mutate(undefined)} loading={publish.isPending}>
              انتشار اکنون
            </Button>
            <input
              type="datetime-local"
              className={ui.textCell}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              aria-label="زمان انتشار"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!schedule}
              onClick={() => publish.mutate(new Date(schedule).toISOString())}
            >
              زمان‌بندی
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
              {preview ? 'ویرایش' : 'پیش‌نمایش'}
            </Button>
          </div>
          {preview ? (
            <div className={ui.panel}>
              {(value.bodyMd ?? '')
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((chunk, i) =>
                  chunk.startsWith('## ') ? (
                    <h3 key={i}>{chunk.slice(3)}</h3>
                  ) : chunk.trim().startsWith('- ') ? (
                    <ul key={i}>
                      {chunk.split('\n').map((l, j) => (
                        <li key={j}>{l.replace(/^- /, '')}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>{chunk}</p>
                  ),
                )}
            </div>
          ) : (
            <p className={ui.muted}>
              وضعیت: {value.status === 'draft' ? 'پیش‌نویس' : value.status === 'scheduled' ? 'زمان‌بندی‌شده' : 'منتشرشده'}
              {value.publishAt ? ` · انتشار: ${formatJalali(value.publishAt)}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
