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
import { toPersianDigits } from '@/lib/utils/format';
import { articleSlugify } from '@/lib/utils/articleSlug';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';
import { MAX_ARTICLE_TAGS, normalizeArticleTags } from '@/lib/utils/articleTags';
import { useToast } from '@/lib/hooks/useToast';
import { useDeepLinkQuery } from '@/lib/hooks/useDeepLinkQuery';
import { ApiError } from '@/lib/api/errors';
import { Alert, Badge, Button, Chip, EmptyState, Switch, TableSkeleton, Tabs, TabPanel, useConfirm } from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import { RichTextEditor } from './editor/RichTextEditor';
import { EditorErrorBoundary } from './editor/EditorErrorBoundary';
import { RichContent } from '@/components/content/RichContent';
import { markdownToDoc } from '@/lib/content/markdownToDoc';
import { EMPTY_DOC, countImagesMissingAlt, docFingerprint, type RichDoc } from '@/lib/content/richDoc';
import { SeoChecklist } from './seo/SeoChecklist';
import { KeywordToolLinks } from './seo/KeywordToolLinks';
import { ArticleSearchConsole } from './seo/ArticleSearchConsole';
import { JalaliDateField } from '../JalaliDateField';
import { PagerFooter } from '../PagerFooter';
import { CommentsModeration } from './CommentsModeration';
import { routes } from '@/lib/routes';
import { SITE_ORIGIN } from '@/lib/utils/url';
import ui from '../adminUi.module.css';
import s from './content.module.css';

/** Matches `adminListArticles`'s server-side default — the admin list
 *  route doesn't accept a client-supplied perPage. */
const PER_PAGE = 50;

/** Top-level switcher (US-14.8) — «نظرات» lives beside the article
 *  status tabs rather than under a new nav item; see CommentsModeration's
 *  own comment for why. */
const SECTION_TABS = [
  { id: 'articles', label: 'مقاله‌ها' },
  { id: 'comments', label: 'نظرات' },
];

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
  const [section, setSection] = useState('articles');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  // null = closed; 'new' = create; an id = edit. One flag instead of two
  // booleans, so the drawer can never be "both creating and editing" at once.
  const [drawerId, setDrawerId] = useState<string | 'new' | null>(null);
  /**
   * The drawer's REACT KEY — deliberately a separate value from `drawerId`.
   *
   * `drawerId` also has to change the instant a brand-new draft is first
   * saved (`'new'` → the real id `onCreated` hands back), so the rest of the
   * panel can address it by id — the URL preview, the redirect tab, publish.
   * If that same value were the `key`, saving a draft for the first time
   * would remount `ArticleDrawer` right after its very first save and throw
   * away Tiptap's undo/redo stack and caret position — exactly the kind of
   * "an afternoon of work quietly worse for no reason" bug this rebuild
   * otherwise went out of its way to fix (see the comment below on
   * `dirtyRef`). Bumping this ONLY in `openEdit`/`openCreate` — i.e. only when
   * the admin explicitly opens a (possibly different) article — keeps the
   * "article A's text can never land on article B" guarantee for the case
   * that actually needs it, without paying for it on every save.
   */
  const [drawerInstanceKey, setDrawerInstanceKey] = useState(0);
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

  const openEdit = (id: string) => guarded(() => {
    setDrawerId(id);
    setDrawerInstanceKey((k) => k + 1);
  });
  const openCreate = () => guarded(() => {
    setDrawerId('new');
    setDrawerInstanceKey((k) => k + 1);
  });
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
        items={SECTION_TABS}
        active={section}
        onChange={setSection}
        label="بخش محتوا"
        idBase="content-section"
      />
      {section === 'comments' ? (
        <div style={{ paddingBlockStart: 'var(--space-4)' }}>
          <CommentsModeration />
        </div>
      ) : (
        <>
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
        </>
      )}

      {drawerId ? (
        <ArticleDrawer
          key={drawerInstanceKey}
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
  bodyJson: RichDoc;
  coverUrl: string | null;
  authorId: string | null;
  tags: string[];
  categoryIds: string[];
  /** Market-news topic slugs (اخبار بازار) — only meaningful/shown for
   *  type==='news', but kept on Values unconditionally like categoryIds
   *  is, so switching an article's type never needs a special reset. */
  newsTopicIds: string[];
  faq: { question: string; answer: string }[];
  seoTitle: string;
  seoDescription: string;
  seoCanonical: string;
  seoOgImage: string;
  /** The phrase this article is written to rank for (US-14.4). Everything in
   *  the SEO checklist keys off it; it is never inferred from the text. */
  seoFocusKeyword: string;
};

function emptyValues(defaultType: 'blog' | 'news'): Values {
  return {
    title: '',
    slug: '',
    type: defaultType,
    excerpt: '',
    bodyJson: EMPTY_DOC,
    coverUrl: null,
    authorId: null,
    tags: [],
    categoryIds: [],
    newsTopicIds: [],
    faq: [],
    seoTitle: '',
    seoDescription: '',
    seoCanonical: '',
    seoOgImage: '',
    seoFocusKeyword: '',
  };
}

function fromArticle(a: ArticleFull): Values {
  return {
    title: a.title,
    slug: a.slug,
    type: a.type,
    excerpt: a.excerpt ?? '',
    // A row written before the structured editor shipped has no `bodyJson`;
    // seeding it from the SAME markdown parser the public page falls back to
    // means opening an old article shows exactly what a reader sees, and the
    // first save simply persists that reading rather than reformatting it.
    // Deliberately NOT `articleDoc()`: that helper's last resort is the
    // curated `BODIES` mock, and writing mock prose into a real row on save
    // is precisely the class of bug this file already carries a warning about.
    bodyJson: a.bodyJson ?? (a.bodyMd?.trim() ? markdownToDoc(a.bodyMd) : EMPTY_DOC),
    coverUrl: a.coverUrl ?? null,
    authorId: a.authorId ?? null,
    tags: a.tags ?? [],
    categoryIds: a.relatedCategoryIds ?? [],
    newsTopicIds: a.relatedNewsTopicIds ?? [],
    faq: a.faq ?? [],
    seoTitle: a.seo?.title ?? '',
    seoDescription: a.seo?.description ?? '',
    seoCanonical: a.seo?.canonical ?? '',
    seoOgImage: a.seo?.ogImage ?? '',
    seoFocusKeyword: a.seo?.focusKeyword ?? '',
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

/**
 * Category picker (US-14.5) — toggle chips over the REAL catalog category
 * list, not free text: unlike `TagField` above, this feeds a real public
 * page (`/blog/category/[slug]`), so an inconsistent spelling here would
 * split one topic into two dead-end pages instead of just looking untidy in
 * the panel. The category list is small and fixed (14 rows today), so a
 * flat toggle-chip cluster needs no search/autocomplete the way tags would.
 */
function CategoryField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useQuery({
    queryKey: ['admin', 'categories', 'picker'],
    queryFn: () => adminApi.categories(),
    staleTime: 5 * 60_000,
  });
  const categories = data?.categories ?? [];

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);
  };

  return (
    <div>
      <span className={ui.tileLabel}>دسته‌بندی محصول</span>
      {categories.length > 0 ? (
        <div className={s.tagChips} aria-label="دسته‌های مقاله">
          {categories.map((c) => (
            <Chip key={c.id} selected={value.includes(c.id)} onClick={() => toggle(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      ) : (
        <div className={ui.tileHint}>در حال بارگذاری دسته‌ها…</div>
      )}
    </div>
  );
}

/**
 * Market-news topic picker — same toggle-chip UX and same reasoning as
 * `CategoryField` above (a closed picker, never free text, so the panic-
 * prone non-technical admin never types anything), over the fixed
 * `NEWS_TOPICS` list instead of a query: there is no admin-managed table
 * to fetch, and there never should be — see `lib/data/newsTopics.ts`.
 * News-only: shown by the caller only when `v.type === 'news'`.
 */
function NewsTopicField({ value, onChange }: { value: string[]; onChange: (slugs: string[]) => void }) {
  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);
  };

  return (
    <div>
      <span className={ui.tileLabel}>موضوع خبر</span>
      <div className={s.tagChips} aria-label="موضوعات خبر">
        {NEWS_TOPICS.map((t) => (
          <Chip key={t.slug} selected={value.includes(t.slug)} onClick={() => toggle(t.slug)}>
            {t.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

type FaqItem = { question: string; answer: string };

/**
 * Per-article FAQ (US-14.7) — free-text Q&A pairs, unlike CategoryField/
 * NewsTopicField above: there is no closed list a question could be
 * picked from. Rendered on the public page by `ArticleFaq` and emitted
 * as FAQPage JSON-LD from the SAME array, so the panel and the schema
 * markup can never show two different sets of questions.
 */
function FaqField({ value, onChange }: { value: FaqItem[]; onChange: (items: FaqItem[]) => void }) {
  const update = (i: number, patch: Partial<FaqItem>) => {
    onChange(value.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { question: '', answer: '' }]);

  return (
    <div className={s.faqList}>
      {value.map((item, i) => (
        <div key={i} className={s.faqRow}>
          <TextInput
            label={`سوال ${toPersianDigitsSafe(i + 1)}`}
            value={item.question}
            maxLength={200}
            onChange={(e) => update(i, { question: e.target.value })}
          />
          <Textarea
            label="پاسخ"
            value={item.answer}
            maxLength={2000}
            rows={3}
            onChange={(e) => update(i, { answer: e.target.value })}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
            حذف این سوال
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" onClick={add} disabled={value.length >= 20}>
        افزودن سوال
      </Button>
      {value.length === 0 ? (
        <div className={ui.tileHint}>بدون سوال متداول، بخش «سوالات متداول» زیر مقاله نمایش داده نمی‌شود.</div>
      ) : null}
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
  // `ArticleDrawer` no longer remounts the instant a first save turns `id`
  // from `null` into a real one (see `drawerInstanceKey` in the parent) — so
  // this has to freeze the slug explicitly on that same transition instead of
  // getting it for free from `useState`'s initializer re-running.
  const wasCreateRef = useRef(isCreate);
  useEffect(() => {
    if (wasCreateRef.current && !isCreate) setSlugTouched(true);
    wasCreateRef.current = isCreate;
  }, [isCreate]);

  /**
   * The body is compared SEPARATELY from every other field.
   *
   * Two reasons it cannot ride along in the whole-object compare. First, the
   * editor normalises the document as it loads it (ProseMirror materialises
   * attribute defaults), so the shape that comes out is legitimately not the
   * shape that went in — the baseline has to be whatever the editor settled
   * on, which is what `onReady` reports. Second, `body_json` is a `jsonb`
   * column and Postgres rewrites object key order, so the saved document reads
   * back byte-different; `docFingerprint` compares content, not spelling.
   */
  const bodyBaselineRef = useRef<string | null>(null);
  const dirty = useMemo(() => {
    // Blanking the body on both sides compares "everything except the body"
    // without listing the fields, so a new one added later is covered too.
    if (JSON.stringify({ ...v, bodyJson: null }) !== JSON.stringify({ ...initial, bodyJson: null })) return true;
    // Until the editor has reported its baseline there is nothing to compare
    // against, and "unknown" must not read as "dirty".
    return bodyBaselineRef.current !== null && docFingerprint(v.bodyJson) !== bodyBaselineRef.current;
  }, [v, initial]);
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
      focusKeyword: v.seoFocusKeyword.trim() || undefined,
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
        bodyJson: v.bodyJson,
        tags: v.tags,
        relatedCategoryIds: v.categoryIds,
        relatedNewsTopicIds: v.newsTopicIds,
        faq: v.faq,
        // Sent on CREATE as well as on save. It used not to be, and the
        // reseed below then overwrote the drawer's SEO inputs with the
        // server's empty ones — a focus keyword typed before the first save
        // vanished silently, with a success toast and no unsaved-changes flag.
        seo: seoPatch(),
      }),
    onSuccess: (res) => {
      toast.success('پیش‌نویس ساخته شد؛ ادامه بدهید.');
      bodyBaselineRef.current = docFingerprint(res.article.bodyJson ?? v.bodyJson);
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
        bodyJson: v.bodyJson,
        coverUrl: v.coverUrl,
        authorId: v.authorId,
        tags: v.tags,
        relatedCategoryIds: v.categoryIds,
        relatedNewsTopicIds: v.newsTopicIds,
        faq: v.faq,
        seo: seoPatch(),
      }),
    onSuccess: (res) => {
      toast.success('ذخیره شد.');
      // The SERVER's copy is the new baseline, not the one just sent: it has
      // been through the same zod schema, so anything the schema normalised
      // (a trimmed alt, a padded chart series) is now what "unchanged" means.
      bodyBaselineRef.current = docFingerprint(res.article.bodyJson ?? v.bodyJson);
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

  const missingAlt = useMemo(() => countImagesMissingAlt(v.bodyJson), [v.bodyJson]);

  /** The server can reject the body itself — too long overall, or one block
   *  shaped wrong (`richDocSchema`'s `superRefine`) — and `formatZodError`
   *  keys that under `bodyJson` or a dotted path into it (`bodyJson.content.12…`
   *  for an issue inside a specific block), never the bare key every OTHER
   *  field error uses. Without this, that rejection surfaced as nothing more
   *  than a generic "ورودی نامعتبر است." toast with zero indication the body
   *  was the cause — for an editor who has no way to see the document's
   *  serialized size, that is an unsavable article with no visible reason. */
  const bodyErrorKey = useMemo(
    () => Object.keys(fieldErrors).find((k) => k === 'bodyJson' || k.startsWith('bodyJson.')),
    [fieldErrors],
  );
  const bodyError = bodyErrorKey ? fieldErrors[bodyErrorKey] : undefined;

  const canSave = v.title.trim() !== '' && v.slug.trim() !== '';
  const busy = isCreate ? create.isPending : save.isPending;

  const doSave = () => {
    if (isCreate) create.mutate();
    else save.mutate();
  };

  const status = article?.status ?? 'draft';
  // Absolute, not `articlePath()`'s bare path: rendered as an
  // `<a target="_blank">` opened from `panel.ahantime.com`, where a relative
  // href resolves against the panel's own origin and gets rewritten by the
  // panel middleware to a nonexistent `/admin/...` route instead of the
  // storefront page.
  const liveUrl =
    article && status !== 'draft' ? `${SITE_ORIGIN}${articlePath(article.type, article.slug)}` : null;

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

            <div className={s.bodyHead}>
              <span className={ui.tileLabel}>متن مقاله</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((x) => !x)}>
                {preview ? 'بازگشت به ویرایش' : 'پیش‌نمایش صفحهٔ منتشرشده'}
              </Button>
            </div>
            {bodyError ? <Alert tone="error">{bodyError}</Alert> : null}

            {/* The editor is never UNMOUNTED to show the preview — doing that
                would throw away undo history and the caret position every time
                someone glanced at the result. */}
            <div hidden={preview}>
              <EditorErrorBoundary onClose={onRequestClose}>
                <RichTextEditor
                  initialDoc={initial.bodyJson}
                  onChange={(doc) => set({ bodyJson: doc })}
                  onReady={(doc) => {
                    // ProseMirror fills in attribute defaults the stored JSON
                    // never carried, so the document that comes back out is
                    // legitimately not byte-identical to the one that went in.
                    // Without adopting it as the baseline, merely OPENING an
                    // article showed «تغییرات ذخیره‌نشده» and armed the
                    // "discard your edits?" prompt on the way out.
                    bodyBaselineRef.current = docFingerprint(doc);
                    setV((prev) => ({ ...prev, bodyJson: doc }));
                  }}
                />
              </EditorErrorBoundary>
            </div>

            {preview ? (
              <div className={s.preview}>
                {/* Literally the component the published page renders. A
                    hand-rolled preview here once dropped bold and links, so
                    what the editor saw was not what readers got. */}
                <RichContent doc={v.bodyJson} />
              </div>
            ) : null}
          </div>

          <div className={s.side}>
            <div className={s.sideCard}>
              <div className={s.sideCardTitle}>انتشار</div>
              {/* The old editor could not attach alt text at all, so every
                  image already on the site has none. Saying so HERE, next to
                  the publish button, is what turns that from an invisible
                  SEO/accessibility debt into a two-click fix. Informational,
                  never blocking: an editor with a deadline must still be able
                  to publish. */}
              {missingAlt > 0 ? (
                <Alert tone="warning">
                  {toPersianDigitsSafe(missingAlt)} تصویر در متن، توضیح (متن جایگزین) ندارد. روی تصویر در متن کلیک
                  کنید و «افزودن متن جایگزین» را بزنید — هم برای گوگل مهم است، هم برای کسانی که تصویر را نمی‌بینند.
                </Alert>
              ) : null}
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
              <CategoryField value={v.categoryIds} onChange={(categoryIds) => set({ categoryIds })} />
              {v.type === 'news' ? (
                <NewsTopicField
                  value={v.newsTopicIds}
                  onChange={(newsTopicIds) => set({ newsTopicIds })}
                />
              ) : null}
            </div>

            {/* On-page SEO (US-14.4). Deliberately NOT inside «تنظیمات
                پیشرفته»: unlike the canonical URL or the OG image, this is
                meant to be read while writing, and a checklist nobody opens
                is a checklist nobody follows. It updates on every keystroke —
                see SeoChecklist for why there is no live region. */}
            <div className={s.sideCard}>
              <div className={s.sideCardTitle}>سئوی این مقاله</div>
              <TextInput
                label="کلیدواژهٔ هدف"
                helper="عبارتی که می‌خواهید این مقاله با آن در گوگل پیدا شود، مثلاً «قیمت میلگرد اصفهان»."
                value={v.seoFocusKeyword}
                maxLength={100}
                // `set()` clears errors keyed by the PATCH field name it was
                // given, which for this input is `seoFocusKeyword` — a server
                // error filed under the dotted zod path would otherwise stick
                // under the box for the rest of the drawer session no matter
                // what the writer typed. Clear it explicitly here.
                error={fieldErrors['seo.focusKeyword']}
                onChange={(e) => {
                  setFieldErrors((prev) => {
                    if (!prev['seo.focusKeyword']) return prev;
                    const next = { ...prev };
                    delete next['seo.focusKeyword'];
                    return next;
                  });
                  set({ seoFocusKeyword: e.target.value });
                }}
              />
              <KeywordToolLinks keyword={v.seoFocusKeyword} />
              <SeoChecklist
                title={v.title}
                seoTitle={v.seoTitle}
                seoDescription={v.seoDescription}
                excerpt={v.excerpt}
                slug={v.slug}
                focusKeyword={v.seoFocusKeyword}
                doc={v.bodyJson}
              />
            </div>

            {/* Renders on every article, every category, per Amir's
                explicit ask — see ArticleFaq's own comment for why this
                is the single source both the visible list and the
                FAQPage JSON-LD read from. */}
            <div className={s.sideCard}>
              <div className={s.sideCardTitle}>سوالات متداول</div>
              <FaqField value={v.faq} onChange={(faq) => set({ faq })} />
            </div>

            {/* Real Google numbers for this page — renders nothing at all
                until the owner has connected Search Console (US-14.4). */}
            {!isCreate && article && status === 'published' ? (
              // The card chrome is passed IN rather than wrapped around, so an
              // unconfigured/unconnected panel renders nothing at all instead
              // of an empty bordered box.
              <ArticleSearchConsole
                className={s.sideCard}
                path={articlePath(article.type, article.slug)}
                published
              />
            ) : null}

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
                          {u.name ?? toPersianDigits(u.mobile)}
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
