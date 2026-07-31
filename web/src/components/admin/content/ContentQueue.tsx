'use client';
/**
 * Content queue (W25 rebuild) — a searchable, paginated article list beside a
 * wide editor drawer, so the admin can find, write and publish anything with
 * the least possible friction.
 *
 * The old screen had no search and no pagination past 50 rows, appended the
 * editor inline below the whole table (opening row 40 scrolled nothing into
 * view), and its "زمان‌بندی" button had no confirm, no pending state and no
 * unsaved-edit warning — writing 900 words, picking a date, and clicking it
 * lost the lot. All of that is fixed here; see the inline comments at each
 * specific defect for what changed and why.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi, type ArticleFull, type AdminRedirect } from '@/lib/api/resources/admin';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { formatJalali } from '@/lib/utils/jalali';
import { articleSlugify } from '@/lib/utils/articleSlug';
import { MAX_ARTICLE_TAGS, normalizeArticleTags } from '@/lib/utils/articleTags';
import { useToast } from '@/lib/hooks/useToast';
import { useDeepLinkQuery } from '@/lib/hooks/useDeepLinkQuery';
import { ApiError } from '@/lib/api/errors';
import { Alert, Badge, Button, Chip, EmptyState, Switch, TableSkeleton, Tabs, TabPanel, useConfirm } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import { MarkdownProse } from '@/components/content/ArticleBody';
import { JalaliDateField } from '../JalaliDateField';
import { PagerFooter } from '../PagerFooter';
import { routes } from '@/lib/routes';
import ui from '../adminUi.module.css';
import s from './content.module.css';

/**
 * Cursor-aware markdown insertion for the toolbar — replaces the current
 * selection (or inserts a placeholder) and restores focus/selection
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

/** Inserts a block on its own line (image, quote-of-one) at the caret. */
function insertBlock(textarea: HTMLTextAreaElement, text: string) {
  const { selectionStart: start, value } = textarea;
  const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
  const insert = `${needsLeadingBreak ? '\n\n' : ''}${text}\n\n`;
  const next = value.slice(0, start) + insert + value.slice(start);
  const pos = start + insert.length;
  return { next, selectStart: pos, selectEnd: pos };
}

/** Matches `adminListArticles`'s server-side default — the admin list
 *  route doesn't accept a client-supplied perPage. */
const PER_PAGE = 50;

const STATUS_TABS = [
  { id: 'draft', label: 'پیش‌نویس' },
  { id: 'scheduled', label: 'زمان‌بندی‌شده' },
  { id: 'published', label: 'منتشرشده' },
];

const STATUS_BADGE: Record<string, { label: string; tone: 'stale' | 'info' | 'gain' }> = {
  draft: { label: 'پیش‌نویس', tone: 'stale' },
  scheduled: { label: 'زمان‌بندی‌شده', tone: 'info' },
  published: { label: 'منتشرشده', tone: 'gain' },
};

/** Same path an article's own live URL resolves to — used both for the
 *  "مشاهده در سایت" link and as the `fromPath` a redirect-away needs to key
 *  on, so the two never drift apart. */
function articlePath(type: 'blog' | 'news', slug: string): string {
  return type === 'news' ? routes.news(slug) : routes.blog(slug);
}

/** Common redirect destinations an admin might want without typing a path by
 *  hand. "آدرس دلخواه" (custom) is handled separately, not listed here. */
const REDIRECT_PRESETS: Array<{ id: string; label: string; path: string }> = [
  { id: 'home', label: 'صفحهٔ اصلی', path: '/' },
  { id: 'prices', label: 'فهرست قیمت‌ها', path: '/prices' },
  { id: 'blog', label: 'وبلاگ', path: '/blog' },
  { id: 'news', label: 'اخبار', path: '/news' },
];

const SITE_HOST = 'ahantime.com';

export function ContentQueue() {
  const [status, setStatus] = useState('draft');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  // null = closed; 'new' = create; an id = edit. One flag instead of two
  // booleans, so the drawer can never be "both creating and editing" at once.
  const [drawerId, setDrawerId] = useState<string | 'new' | null>(null);
  const { confirm, dialog: leaveDialog } = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // `/admin/content?q=slug&status=published` from the command palette. The
  // status tab has to move with it — there is no "all" tab, so a published
  // article deep-linked onto the default «پیش‌نویس» tab shows nothing at all.
  useDeepLinkQuery((deepQ, param) => {
    setSearch(deepQ);
    setQ(deepQ);
    const deepStatus = param('status');
    if (deepStatus && STATUS_TABS.some((t) => t.id === deepStatus)) setStatus(deepStatus);
    setType('');
  });

  useEffect(() => {
    setPage(1);
  }, [status, type, q]);

  /**
   * Dirtiness lives HERE, not in the drawer.
   *
   * The drawer is keyed by `drawerId`, which is what stops article A's text
   * being written onto article B — but it also means the drawer unmounts the
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

  /** Every path that closes or switches the drawer routes through here —
   *  including the drawer's own Esc / scrim-click / «انصراف», via `onRequestClose`
   *  below, so there is exactly one confirm implementation, not two that could
   *  drift or double-fire. */
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

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'articles', status, type, q, page],
    queryFn: () => adminApi.articles({ status, type: type || undefined, q: q || undefined, page }),
  });
  const articles = data?.articles ?? [];
  const total = data?.total ?? 0;

  const openEdit = (id: string) => guarded(() => setDrawerId(id));
  const openCreate = () => guarded(() => setDrawerId('new'));
  const closeDrawer = () => {
    dirtyRef.current = false;
    setDrawerId(null);
  };
  const requestCloseDrawer = () => guarded(closeDrawer);

  const invalidateList = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'articles'] });
    // The sidebar's «محتوا» badge and the dashboard's «پیش‌نویس محتوا» tile
    // both read this key; the old screen never invalidated it, so both kept
    // showing a stale count after every create/publish/delete.
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  return (
    <div>
      {leaveDialog}
      {/* Status/type/search only ever change what the LIST shows — the drawer
          is an independent overlay now, not content pushed inline below the
          table, so none of these can discard an open article's unsaved edits.
          Guarding them anyway would pop a "رهاکردن ویرایش؟" confirm for an
          action that discards nothing. */}
      <Tabs
        items={STATUS_TABS}
        active={status}
        onChange={setStatus}
        label="وضعیت محتوا"
        idBase="content"
      />
      {STATUS_TABS.map((t) => (
        <TabPanel key={t.id} id={t.id} active={status} idBase="content">
          <div style={{ paddingBlockStart: 'var(--space-4)' }}>
            <div className={s.toolbar}>
              <div className={s.searchBox}>
                <input
                  type="search"
                  className={`${ui.textCell} ${s.searchInput}`}
                  placeholder="جستجو در عنوان، نشانی، خلاصه و متن…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="جستجوی مقاله"
                />
              </div>
              <Chip selected={type === ''} onClick={() => setType('')}>
                همه
              </Chip>
              <Chip selected={type === 'blog'} onClick={() => setType('blog')}>
                وبلاگ
              </Chip>
              <Chip selected={type === 'news'} onClick={() => setType('news')}>
                خبر
              </Chip>
              <span className={s.countBadge}>
                {toPersianDigitsSafe(total)} مقاله{isFetching ? ' · در حال به‌روزرسانی…' : ''}
              </span>
              <Button size="sm" variant="secondary" style={{ marginInlineStart: 'auto' }} onClick={openCreate}>
                مقالهٔ جدید
              </Button>
            </div>

            {isLoading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : isError ? (
              <EmptyState
                size="section"
                tone="error"
                headline="بارگذاری مقاله‌ها ناموفق بود."
                primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
              />
            ) : articles.length === 0 ? (
              <EmptyState
                size="section"
                headline={q ? `مقاله‌ای با «${q}» پیدا نشد` : 'مقاله‌ای نیست'}
                body={q ? 'شاید در وضعیت یا نوع دیگری باشد.' : 'با «مقالهٔ جدید» شروع کنید.'}
                primary={q ? { label: 'پاک‌کردن جستجو', onClick: () => setSearch('') } : { label: 'مقالهٔ جدید', onClick: openCreate }}
              />
            ) : (
              <>
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <caption className="visually-hidden">
                      فهرست مقاله‌های {STATUS_TABS.find((x) => x.id === status)?.label}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">عنوان</th>
                        <th scope="col">نوع</th>
                        <th scope="col">وضعیت</th>
                        <th scope="col">{status === 'draft' ? 'آخرین ویرایش' : 'انتشار'}</th>
                        <th scope="col">
                          <span className="visually-hidden">عملیات</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map((a) => {
                        const st = STATUS_BADGE[a.status] ?? STATUS_BADGE.draft!;
                        return (
                          <tr key={a.id}>
                            <td className={s.titleCell}>
                              <strong>{a.title}</strong>
                              <span className={s.slugLine}>/{a.type === 'news' ? 'news' : 'blog'}/{a.slug}</span>
                            </td>
                            <td>{a.type === 'blog' ? 'وبلاگ' : 'خبر'}</td>
                            <td>
                              <Badge tone={st.tone}>{st.label}</Badge>
                            </td>
                            <td className="tnum">{a.publishAt ? formatJalali(a.publishAt) : '—'}</td>
                            <td>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(a.id)}>
                                ویرایش
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PagerFooter page={page} perPage={PER_PAGE} total={total} onPage={setPage} />
              </>
            )}
          </div>
        </TabPanel>
      ))}

      {drawerId ? (
        <ArticleDrawer
          key={drawerId}
          id={drawerId === 'new' ? null : drawerId}
          defaultType={type === 'news' ? 'news' : 'blog'}
          onRequestClose={requestCloseDrawer}
          onDirtyChange={(d) => {
            dirtyRef.current = d;
          }}
          onSaved={() => {
            invalidateList();
          }}
          onCreated={(newId, created) => {
            // Stay open, switch to edit mode on the row we just made — the
            // admin keeps writing without a close/reopen round-trip, and the
            // freshly-created data seeds the query cache so there's no
            // loading flash back to an empty form.
            qc.setQueryData(['admin', 'article', newId], { article: created });
            dirtyRef.current = false;
            setDrawerId(newId);
            invalidateList();
          }}
          onDeleted={() => {
            dirtyRef.current = false;
            setDrawerId(null);
            invalidateList();
            toast.success('پیش‌نویس حذف شد.');
          }}
        />
      ) : null}
    </div>
  );
}

/** `toPersianDigits` on a possibly-undefined total during the very first
 *  render, without a null check at every call site. */
function toPersianDigitsSafe(n: number): string {
  return new Intl.NumberFormat('fa-IR').format(n);
}

type Values = {
  title: string;
  slug: string;
  type: 'blog' | 'news';
  excerpt: string;
  bodyMd: string;
  coverUrl: string | null;
  authorId: string | null;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  seoCanonical: string;
  seoOgImage: string;
};

function emptyValues(defaultType: 'blog' | 'news'): Values {
  return {
    title: '',
    slug: '',
    type: defaultType,
    excerpt: '',
    bodyMd: '',
    coverUrl: null,
    authorId: null,
    tags: [],
    seoTitle: '',
    seoDescription: '',
    seoCanonical: '',
    seoOgImage: '',
  };
}

function fromArticle(a: ArticleFull): Values {
  return {
    title: a.title,
    slug: a.slug,
    type: a.type,
    excerpt: a.excerpt ?? '',
    bodyMd: a.bodyMd ?? '',
    coverUrl: a.coverUrl ?? null,
    authorId: a.authorId ?? null,
    tags: a.tags ?? [],
    seoTitle: a.seo?.title ?? '',
    seoDescription: a.seo?.description ?? '',
    seoCanonical: a.seo?.canonical ?? '',
    seoOgImage: a.seo?.ogImage ?? '',
  };
}

/**
 * Free-text tag chips. Enter or a comma commits what's typed; a pasted
 * «میلگرد, تیرآهن» commits both at once.
 *
 * Every commit runs the SAME `normalizeArticleTags` the API route's zod
 * transform runs, so the chips shown are exactly what will be stored — typing
 * the Arabic-ي spelling of a tag already on the article visibly does nothing
 * instead of appearing to add a second, identical-looking chip that the server
 * would then silently drop.
 *
 * No autocomplete endpoint in v1 — free text is enough to start accumulating
 * tags, and the public /blog/tag/[tag] route they'd feed is deliberately out
 * of scope until it has an SEO story.
 */
function TagField({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const atLimit = value.length >= MAX_ARTICLE_TAGS;

  const commit = (raw: string) => {
    const next = normalizeArticleTags([...value, ...raw.split(',')]);
    setDraft('');
    // Reference-compare: committing a duplicate produces an equal list, and
    // firing onChange with it would mark the form dirty for no change.
    if (next.length !== value.length || next.some((t, i) => t !== value[i])) onChange(next);
  };

  return (
    <div>
      {value.length > 0 ? (
        <div className={s.tagChips} aria-label="برچسب‌های ثبت‌شده">
          {value.map((tag) => (
            <Chip key={tag} onRemove={() => onChange(value.filter((t) => t !== tag))}>
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
      <TextInput
        id="article-tags"
        label="برچسب‌ها"
        value={draft}
        maxLength={40}
        disabled={atLimit}
        helper={
          atLimit
            ? `حداکثر ${toPersianDigitsSafe(MAX_ARTICLE_TAGS)} برچسب.`
            : 'با Enter یا «،» ثبت می‌شود.'
        }
        onChange={(e) => {
          const next = e.target.value;
          // A comma anywhere (typed or pasted) is a commit, not a character.
          if (next.includes(',') || next.includes('،')) commit(next.replace(/،/g, ','));
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // The drawer has a primary save button; Enter here must add a tag,
            // not submit the article.
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        // A tag typed but not committed before clicking Save would otherwise be
        // silently discarded — the editor sees it in the box and assumes it saved.
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

function ArticleDrawer({
  id,
  defaultType,
  onRequestClose,
  onDirtyChange,
  onSaved,
  onCreated,
  onDeleted,
}: {
  /** null = creating a new article. */
  id: string | null;
  defaultType: 'blog' | 'news';
  onRequestClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onCreated: (id: string, article: ArticleFull) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const isCreate = id === null;
  const { confirm, dialog } = useConfirm();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'article', id],
    queryFn: () => adminApi.article(id!),
    enabled: !isCreate,
  });
  const article = data?.article;

  const initial = useMemo(() => (article ? fromArticle(article) : emptyValues(defaultType)), [article, defaultType]);
  const [v, setV] = useState<Values>(initial);
  // Re-seed once the fetch for an existing article lands — `initial` starts as
  // `emptyValues` for one render while the query is in flight.
  const seeded = useRef(false);
  useEffect(() => {
    if (article && !seeded.current) {
      setV(fromArticle(article));
      seeded.current = true;
    }
  }, [article]);

  /** Slug auto-derives from the title only on CREATE, and only until the admin
   *  edits it by hand — mirrors the SKU drawer's pattern. On an existing
   *  article it starts frozen too (`!isCreate`): the URL control itself now
   *  lives inside the collapsed «تنظیمات پیشرفته» section, so simply opening
   *  that panel to look around can never retype a live, indexed URL. */
  const [slugTouched, setSlugTouched] = useState(!isCreate);

  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const panelRef = useFocusTrap<HTMLDivElement>(true, onRequestClose);

  const set = (patch: Partial<Values>) => {
    setV((prev) => {
      const next = { ...prev, ...patch };
      if (patch.title !== undefined && !slugTouched) next.slug = articleSlugify(patch.title);
      return next;
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  const applyMd = (fn: (ta: HTMLTextAreaElement) => { next: string; selectStart: number; selectEnd: number }) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const { next, selectStart, selectEnd } = fn(ta);
    set({ bodyMd: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selectStart, selectEnd);
    });
  };

  const qc = useQueryClient();

  const { data: authorsData } = useQuery({
    queryKey: ['admin', 'users', 'authors'],
    queryFn: () => adminApi.users({ role: 'content' }),
  });

  /**
   * Redirect-away (new, per explicit request): send this article's own
   * address somewhere else on the site. Only meaningful once the article has
   * a real saved address — `articlePath(article.type, article.slug)`, not the
   * in-progress `v.type`/`v.slug`, so an unsaved title/type edit can't be
   * mistaken for the page a visitor would actually land on.
   *
   * No server-side filter exists on the redirects list (see admin.ts), so
   * this fetches the whole table and finds the one match client-side — fine
   * at site-wide-redirect-count scale, only fetched once "تنظیمات پیشرفته"
   * is opened on a saved article.
   */
  const currentPath = article ? articlePath(article.type, article.slug) : null;
  const { data: redirectsData } = useQuery({
    queryKey: ['admin', 'redirects'],
    queryFn: () => adminApi.redirects(),
    enabled: !isCreate && advanced,
  });
  const existingRedirect: AdminRedirect | undefined = useMemo(
    () => (currentPath ? redirectsData?.redirects.find((r) => r.fromPath === currentPath) : undefined),
    [redirectsData, currentPath],
  );

  const [redirectOn, setRedirectOn] = useState(false);
  const [redirectPresetId, setRedirectPresetId] = useState<string>(REDIRECT_PRESETS[0]!.id);
  const [redirectCustomPath, setRedirectCustomPath] = useState('');
  const redirectSeeded = useRef(false);
  useEffect(() => {
    if (!redirectsData || redirectSeeded.current) return;
    redirectSeeded.current = true;
    if (!existingRedirect) return;
    setRedirectOn(true);
    const preset = REDIRECT_PRESETS.find((p) => p.path === existingRedirect.toPath);
    if (preset) {
      setRedirectPresetId(preset.id);
    } else {
      setRedirectPresetId('custom');
      setRedirectCustomPath(existingRedirect.toPath);
    }
  }, [redirectsData, existingRedirect]);

  const redirectTargetPath =
    redirectPresetId === 'custom' ? redirectCustomPath.trim() : REDIRECT_PRESETS.find((p) => p.id === redirectPresetId)?.path ?? '';
  const redirectCustomValid = redirectPresetId !== 'custom' || /^\/[^\s]*$/.test(redirectCustomPath.trim());
  const redirectDirty =
    redirectOn !== Boolean(existingRedirect) || (redirectOn && Boolean(existingRedirect) && redirectTargetPath !== existingRedirect?.toPath);

  const redirectMutation = useMutation({
    mutationFn: async () => {
      if (!redirectOn) {
        if (existingRedirect) await adminApi.deleteRedirect(existingRedirect.id);
        return;
      }
      if (existingRedirect) await adminApi.updateRedirect(existingRedirect.id, { toPath: redirectTargetPath });
      else await adminApi.createRedirect({ fromPath: currentPath!, toPath: redirectTargetPath });
    },
    onSuccess: () => {
      toast.success(redirectOn ? 'هدایت ذخیره شد؛ تا حدود یک دقیقه روی سایت اعمال می‌شود.' : 'هدایت غیرفعال شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'redirects'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیرهٔ هدایت ناموفق بود.'),
  });

  const seoPatch = () => {
    const seo = {
      title: v.seoTitle.trim() || undefined,
      description: v.seoDescription.trim() || undefined,
      canonical: v.seoCanonical.trim() || undefined,
      ogImage: v.seoOgImage.trim() || undefined,
    };
    return Object.values(seo).some(Boolean) ? seo : null;
  };

  const create = useMutation({
    mutationFn: () =>
      adminApi.createArticle({
        slug: v.slug,
        type: v.type,
        title: v.title.trim(),
        excerpt: v.excerpt.trim() || undefined,
        bodyMd: v.bodyMd,
        tags: v.tags,
      }),
    onSuccess: (res) => {
      toast.success('پیش‌نویس ساخته شد؛ ادامه بدهید.');
      onCreated(res.article.id, res.article);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ساخت مقاله ناموفق بود.');
    },
  });

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateArticle(id!, {
        title: v.title.trim(),
        slug: v.slug,
        type: v.type,
        excerpt: v.excerpt.trim() || null,
        bodyMd: v.bodyMd,
        coverUrl: v.coverUrl,
        authorId: v.authorId,
        tags: v.tags,
        seo: seoPatch(),
      }),
    onSuccess: () => {
      toast.success('ذخیره شد.');
      seeded.current = false;
      void qc.invalidateQueries({ queryKey: ['admin', 'article', id] });
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.');
    },
  });

  const publish = useMutation({
    mutationFn: (publishAt?: string) => adminApi.publishArticle(id!, publishAt),
    onSuccess: (res) => {
      toast.success(res.article.status === 'published' ? 'منتشر شد.' : 'زمان‌بندی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'article', id] });
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'انتشار ناموفق بود.'),
  });

  const unpublish = useMutation({
    mutationFn: () => adminApi.updateArticle(id!, { status: 'draft' }),
    onSuccess: () => {
      toast.success('به پیش‌نویس بازگشت.');
      void qc.invalidateQueries({ queryKey: ['admin', 'article', id] });
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'لغو انتشار ناموفق بود.'),
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteArticle(id!),
    onSuccess: () => onDeleted(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'حذف ناموفق بود.'),
  });

  const canSave = v.title.trim() !== '' && v.slug.trim() !== '';
  const busy = isCreate ? create.isPending : save.isPending;

  const doSave = () => {
    if (isCreate) create.mutate();
    else save.mutate();
  };

  const status = article?.status ?? 'draft';
  const liveUrl = article && status !== 'draft' ? articlePath(article.type, article.slug) : null;

  if (!isCreate && isLoading) {
    return (
      <>
        <div className={s.scrim} onClick={onRequestClose} aria-hidden="true" />
        <div className={s.drawer} role="dialog" aria-modal="true" aria-label="در حال بارگذاری مقاله">
          <div className={s.drawerBody}>
            <TableSkeleton rows={6} cols={1} />
          </div>
        </div>
      </>
    );
  }

  if (!isCreate && !isLoading && !article) {
    return (
      <>
        <div className={s.scrim} onClick={onRequestClose} aria-hidden="true" />
        <div className={s.drawer} role="dialog" aria-modal="true" aria-label="مقاله یافت نشد">
          <div className={s.drawerBody}>
            <EmptyState size="section" tone="error" headline="این مقاله یافت نشد." body="ممکن است حذف شده باشد." />
          </div>
          <div className={s.drawerFoot}>
            <Button variant="ghost" onClick={onRequestClose}>
              بستن
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={s.scrim} onClick={onRequestClose} aria-hidden="true" />
      <div className={s.drawer} role="dialog" aria-modal="true" aria-label={isCreate ? 'مقالهٔ جدید' : `ویرایش ${v.title}`} ref={panelRef}>
        <div className={s.drawerHead}>
          <div className={s.titleRow}>
            <input
              className={s.titleInput}
              placeholder="عنوان مقاله…"
              value={v.title}
              onChange={(e) => set({ title: e.target.value })}
              aria-label="عنوان"
              autoFocus
            />
          </div>
          <div className={s.metaRow}>
            <Badge tone={STATUS_BADGE[status]?.tone ?? 'stale'}>{STATUS_BADGE[status]?.label ?? status}</Badge>
            {liveUrl ? (
              <a className={s.viewLive} href={liveUrl} target="_blank" rel="noreferrer">
                مشاهده در سایت ↗
              </a>
            ) : null}
            {fieldErrors.title ? <span className={ui.tileHintError}>{fieldErrors.title}</span> : null}
          </div>
          {/* Read-only — editing lives in «تنظیمات پیشرفته» below. Always
              visible so the admin sees what the page's own address will be
              without hunting for it, but nothing here invites a click. */}
          <span className={s.slugPreview}>{articlePath(v.type, v.slug || '…')}</span>
        </div>

        <div className={s.drawerBody}>
          <div className={s.main}>
            <Textarea
              label="خلاصه"
              rows={2}
              helper="در کارت لیست مقاله‌ها و به‌عنوان توضیح پیش‌فرض سئو استفاده می‌شود."
              value={v.excerpt}
              error={fieldErrors.excerpt}
              maxLength={500}
              onChange={(e) => set({ excerpt: e.target.value })}
            />

            <div className={s.metaRow} style={{ justifyContent: 'space-between' }}>
              <div className={s.mdToolbar}>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => wrapSelection(ta, '**', '**', 'متن پررنگ'))}>
                  پررنگ
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => wrapSelection(ta, '*', '*', 'متن مورب'))}>
                  مورب
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '## '))}>
                  عنوان
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '### '))}>
                  زیرعنوان
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '- '))}>
                  فهرست
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '1. '))}>
                  فهرست شماره‌دار
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => applyMd((ta) => prefixLines(ta, '> '))}>
                  نقل‌قول
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
              <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((x) => !x)}>
                {preview ? 'ویرایش متن' : 'پیش‌نمایش'}
              </Button>
            </div>

            {preview ? (
              <div className={s.preview}>
                {/* The exact renderer the published article page uses — a
                    hand-rolled preview here once dropped bold/links, so what
                    the editor saw was not what readers got. */}
                <MarkdownProse md={v.bodyMd} />
              </div>
            ) : (
              <Textarea
                ref={bodyRef}
                label="متن (Markdown)"
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  minBlockSize: 420,
                  resize: 'vertical',
                  direction: 'rtl',
                  unicodeBidi: 'isolate',
                }}
                value={v.bodyMd}
                error={fieldErrors.bodyMd}
                onChange={(e) => set({ bodyMd: e.target.value })}
              />
            )}

            <ImagePicker
              label="افزودن تصویر داخل متن"
              onInsert={(url) => applyMd((ta) => insertBlock(ta, `![](${url})`))}
            />
          </div>

          <div className={s.side}>
            <div className={s.sideCard}>
              <div className={s.sideCardTitle}>انتشار</div>
              <Button size="sm" onClick={doSave} loading={busy} disabled={!canSave || (!isCreate && !dirty)}>
                {isCreate ? 'ذخیرهٔ پیش‌نویس' : 'ذخیره'}
              </Button>
              {!isCreate && status === 'draft' ? (
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
                        body: dirty
                          ? 'تغییرات ذخیره‌نشده دارید — اول «ذخیره» را بزنید، وگرنه نسخهٔ قبلی منتشر می‌شود. ادامه می‌دهید؟'
                          : `«${v.title}» همین حالا در سایت منتشر می‌شود و در نقشهٔ سایت و جستجوی گوگل هم ظاهر می‌شود.`,
                        confirmLabel: 'انتشار',
                      }).then((ok) => {
                        if (ok) publish.mutate(undefined);
                      })
                    }
                  >
                    انتشار اکنون
                  </Button>
                  <div className={s.scheduleRow}>
                    <JalaliDateField value={schedule} onChange={setSchedule} label="تاریخ انتشار (شمسی)" />
                    <input
                      type="time"
                      className={ui.textCell}
                      style={{ inlineSize: '6rem' }}
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      aria-label="ساعت انتشار"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!schedule}
                    loading={publish.isPending}
                    onClick={() => {
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
                        body: dirty
                          ? 'تغییرات ذخیره‌نشده دارید — اول «ذخیره» را بزنید، وگرنه نسخهٔ قبلی زمان‌بندی می‌شود. ادامه می‌دهید؟'
                          : `«${v.title}» در ${formatJalali(at)} به‌صورت خودکار منتشر می‌شود.`,
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
                    حذف پیش‌نویس
                  </Button>
                </>
              ) : null}
              {!isCreate && status !== 'draft' ? (
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
                      body: `«${v.title}» از سایت برداشته می‌شود و نشانی‌اش دیگر باز نمی‌شود. اگر گوگل آن را ثبت کرده باشد، نتیجه‌اش هم از دسترس خارج می‌شود. مقاله به پیش‌نویس برمی‌گردد و هر زمان می‌توانید دوباره منتشرش کنید.`,
                      confirmLabel: 'لغو انتشار',
                    }).then((ok) => {
                      if (ok) unpublish.mutate();
                    })
                  }
                >
                  لغو انتشار
                </Button>
              ) : null}
            </div>

            <div className={s.sideCard}>
              <div className={s.sideCardTitle}>مشخصات</div>
              <div>
                <label className={ui.tileLabel} htmlFor="article-type">
                  نوع
                </label>
                <select
                  id="article-type"
                  className={ui.select}
                  style={{ inlineSize: '100%' }}
                  value={v.type}
                  onChange={(e) => set({ type: e.target.value as 'blog' | 'news' })}
                >
                  <option value="blog">وبلاگ</option>
                  <option value="news">خبر</option>
                </select>
                {!isCreate && article && v.type !== article.type ? (
                  <div className={ui.tileHintWarn}>نشانی صفحه عوض می‌شود؛ انتقال خودکار از نشانی قبلی ساخته می‌شود.</div>
                ) : null}
              </div>
              <ImageUpload label="تصویر کاور" value={v.coverUrl} onChange={(url) => set({ coverUrl: url })} />
              <TagField value={v.tags} onChange={(tags) => set({ tags })} />
            </div>

            {/* Everything below is for a non-technical admin's rare/one-time
                decisions — the URL, who wrote it, sending readers elsewhere,
                and how it looks in a Google result — so it starts collapsed
                and out of the way of just writing an article. */}
            <div className={s.sideCard}>
              <Button size="sm" variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced((x) => !x)}>
                {advanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
              </Button>
              {advanced ? (
                <>
                  {!isCreate ? (
                    <Alert tone="warning">
                      نشانی فعلی ممکن است در گوگل ثبت و توسط مشتریان ذخیره شده باشد. با تغییر آن، انتقالی خودکار از
                      نشانی قدیمی به جدید ساخته می‌شود تا لینک‌های قبلی نشکنند.
                    </Alert>
                  ) : null}
                  <TextInput
                    label="نشانی صفحه"
                    dir="ltr"
                    helper="خودکار از روی عنوان ساخته می‌شود؛ فقط اگر دلیل خاصی دارید تغییرش دهید."
                    value={v.slug}
                    error={fieldErrors.slug}
                    maxLength={120}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set({ slug: e.target.value });
                    }}
                  />

                  <div>
                    <label className={ui.tileLabel} htmlFor="article-author">
                      نویسنده
                    </label>
                    <select
                      id="article-author"
                      className={ui.select}
                      style={{ inlineSize: '100%' }}
                      value={v.authorId ?? ''}
                      onChange={(e) => set({ authorId: e.target.value || null })}
                    >
                      <option value="">من (پیش‌فرض)</option>
                      {(authorsData?.users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.mobile}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className={s.sideCardTitle}>هدایت این صفحه به آدرس دیگر</div>
                    {isCreate || !currentPath ? (
                      <div className={ui.tileHint}>برای هدایت این صفحه به جای دیگر، ابتدا یک‌بار مقاله را ذخیره کنید.</div>
                    ) : (
                      <>
                        <Switch
                          checked={redirectOn}
                          onChange={setRedirectOn}
                          label="بازدیدکننده‌های این صفحه به آدرس دیگری در سایت هدایت شوند"
                        />
                        {redirectOn ? (
                          <>
                            <div>
                              <label className={ui.tileLabel} htmlFor="redirect-target">
                                مقصد
                              </label>
                              <select
                                id="redirect-target"
                                className={ui.select}
                                style={{ inlineSize: '100%' }}
                                value={redirectPresetId}
                                onChange={(e) => setRedirectPresetId(e.target.value)}
                              >
                                {REDIRECT_PRESETS.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.label}
                                  </option>
                                ))}
                                <option value="custom">آدرس دلخواه…</option>
                              </select>
                            </div>
                            {redirectPresetId === 'custom' ? (
                              <TextInput
                                label="آدرس دلخواه"
                                dir="ltr"
                                helper="باید با / شروع شود، مثلاً /blog/یک-مقالهٔ-دیگر"
                                value={redirectCustomPath}
                                error={redirectCustomPath && !redirectCustomValid ? 'آدرس باید با / شروع شود.' : undefined}
                                maxLength={300}
                                onChange={(e) => setRedirectCustomPath(e.target.value)}
                              />
                            ) : null}
                            {status === 'published' ? (
                              <Alert tone="warning">
                                این مقاله هم‌اکنون در سایت منتشر است. با ذخیرهٔ این هدایت، نشانی فعلی‌اش دیگر برای
                                بازدیدکننده باز نمی‌شود و مستقیم به مقصد بالا می‌رود — با اینکه وضعیت آن در این پنل
                                همچنان «منتشرشده» باقی می‌ماند. اعمال‌شدن روی سایت تا حدود یک دقیقه طول می‌کشد.
                              </Alert>
                            ) : null}
                          </>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={redirectMutation.isPending}
                          disabled={!redirectDirty || (redirectOn && (!redirectTargetPath || !redirectCustomValid))}
                          onClick={() => redirectMutation.mutate()}
                        >
                          {redirectOn ? 'ذخیرهٔ هدایت' : 'غیرفعال‌کردن هدایت'}
                        </Button>
                      </>
                    )}
                  </div>

                  <div>
                    <div className={s.sideCardTitle}>نمایش در نتیجهٔ جستجوی گوگل</div>
                    <div className={s.googlePreview}>
                      <div className={s.googlePreviewUrl}>
                        {SITE_HOST}
                        {articlePath(v.type, v.slug || '…')}
                      </div>
                      <div className={s.googlePreviewTitle}>{v.seoTitle.trim() || v.title.trim() || 'عنوان مقاله'}</div>
                      <div className={s.googlePreviewDesc}>
                        {v.seoDescription.trim() || v.excerpt.trim() || 'برای این مقاله توضیحی ثبت نشده؛ گوگل خودش بخشی از متن را نشان می‌دهد.'}
                      </div>
                    </div>
                    <TextInput
                      label="عنوان در نتیجهٔ گوگل"
                      helper="پیش‌فرض: عنوان مقاله."
                      value={v.seoTitle}
                      maxLength={70}
                      onChange={(e) => set({ seoTitle: e.target.value })}
                    />
                    <Textarea
                      label="توضیح در نتیجهٔ گوگل"
                      rows={2}
                      helper="پیش‌فرض: خلاصه."
                      value={v.seoDescription}
                      maxLength={200}
                      onChange={(e) => set({ seoDescription: e.target.value })}
                    />
                    <ImageUpload
                      label="تصویر پیش‌نمایش هنگام اشتراک‌گذاری"
                      value={v.seoOgImage || null}
                      onChange={(url) => set({ seoOgImage: url ?? '' })}
                    />
                    <TextInput
                      label="آدرس اصلی جایگزین (به‌ندرت لازم است)"
                      dir="ltr"
                      helper="فقط وقتی همین متن جای دیگری از سایت هم هست و می‌خواهید گوگل آن صفحه را اصلی بداند."
                      value={v.seoCanonical}
                      error={v.seoCanonical && !/^\//.test(v.seoCanonical.trim()) ? 'باید با / شروع شود.' : undefined}
                      maxLength={300}
                      onChange={(e) => set({ seoCanonical: e.target.value })}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={s.drawerFoot}>
          <Button onClick={doSave} loading={busy} disabled={!canSave || (!isCreate && !dirty)}>
            {isCreate ? 'ذخیرهٔ پیش‌نویس' : 'ذخیره'}
          </Button>
          <Button variant="ghost" onClick={onRequestClose}>
            بستن
          </Button>
          {dirty ? <span className={`${ui.tileHint} ${s.footSpacer}`}>تغییرات ذخیره‌نشده</span> : null}
        </div>
      </div>
      {dialog}
    </>
  );
}

/** A thin wrapper over ImageUpload that reports the uploaded URL once and
 *  resets — the body toolbar inserts it as markdown rather than holding it as
 *  a persistent field. */
function ImagePicker({ label, onInsert }: { label: string; onInsert: (url: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ImageUpload
      label={label}
      value={value}
      onChange={(url) => {
        setValue(null);
        if (url) onInsert(url);
      }}
    />
  );
}
