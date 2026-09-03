'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { api, isApiError } from '@/lib/api';
import { formatJalali } from '@/lib/utils/jalali';
import { useAuthStore } from '@/lib/stores/auth';
import { PlusIcon, ChatIcon } from '@/components/primitives/icons';
import styles from './ConversationRail.module.css';

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/** «امروز» / «دیروز» / a Jalali date — the grouping every chat product uses,
 *  because "when" is how people locate a conversation they half-remember. */
function bucketOf(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  if (days < 7) return 'هفتهٔ گذشته';
  if (days < 31) return 'ماه گذشته';
  return 'قدیمی‌تر';
}

const ORDER = ['امروز', 'دیروز', 'هفتهٔ گذشته', 'ماه گذشته', 'قدیمی‌تر'];

/**
 * The conversation history rail.
 *
 * WHY IT EXISTS. Every turn has always been persisted, and until now the only
 * control was «گفتگوی جدید» — a button that throws the current one away. That
 * was survivable while a conversation was just text; it stopped being so once
 * a conversation started carrying state (the product, size, city and tonnage
 * it has established) and a returning customer's own order history. A buyer
 * who priced 20 tonnes on Sunday and wants to reopen it on Tuesday had no way
 * back.
 *
 * WHAT IT SHOWS. Titles derived from the visitor's own first message — not
 * from the model's rolling summary, and not from a timestamp. People find a
 * conversation by remembering what they ASKED (see
 * `aiConversationsRepo.conversationTitle`).
 *
 * THE SIGNED-OUT STATE IS NOT AN ERROR. An anonymous visitor's conversations
 * are stored with a null `user_id` and are reachable only from the browser
 * that created them — the correct privacy behaviour on the shared phone in a
 * site office. So a 401 renders as an invitation to sign in, not a failure.
 */
export function ConversationRail({
  activeId,
  onOpen,
  onNew,
  onDismiss,
}: {
  activeId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Mobile drawer only — closes it after a selection. */
  onDismiss?: () => void;
}) {
  const authStatus = useAuthStore((s) => s.status);
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await api.ai.conversations();
      setItems(res.conversations);
      setNeedsLogin(false);
    } catch (e) {
      if (isApiError(e) && e.status === 401) {
        setNeedsLogin(true);
        setItems([]);
      } else {
        setFailed(true);
      }
    }
  }, []);

  // Reloads when the session resolves: `AuthHydrator` settles the store after
  // first paint, so a fetch fired on mount alone would 401 for a signed-in
  // visitor and render the guest state to someone who is logged in.
  useEffect(() => {
    if (authStatus === 'loading') return;
    void load();
  }, [authStatus, load]);

  // …and when a turn lands, so a brand-new conversation appears in the list it
  // belongs to instead of only after a reload.
  useEffect(() => {
    if (!activeId) return;
    void load();
  }, [activeId, load]);

  const grouped = ORDER.map((bucket) => ({
    bucket,
    rows: (items ?? []).filter((c) => bucketOf(c.updatedAt) === bucket),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className={styles.rail}>
      <div className={styles.railHead}>
        <button
          type="button"
          className={styles.newBtn}
          onClick={() => {
            onNew();
            onDismiss?.();
          }}
        >
          <PlusIcon size={16} aria-hidden="true" />
          گفتگوی جدید
        </button>
      </div>

      <nav className={styles.list} aria-label="گفتگوهای پیشین">
        {needsLogin ? (
          <p className={styles.empty}>
            برای دیدن گفتگوهای قبلی‌ات{' '}
            <Link href={routes.login(routes.ai())} className={styles.link}>
              وارد حساب کاربری
            </Link>{' '}
            شو. گفتگوی فعلی‌ات همین‌جا می‌ماند.
          </p>
        ) : failed ? (
          <p className={styles.empty}>
            فهرست گفتگوها بارگذاری نشد.{' '}
            <button type="button" className={styles.retry} onClick={() => void load()}>
              دوباره تلاش کن
            </button>
          </p>
        ) : items === null ? (
          <p className={styles.empty}>در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>هنوز گفتگوی ذخیره‌شده‌ای نداری.</p>
        ) : (
          grouped.map((group) => (
            <div key={group.bucket} className={styles.group}>
              <p className={styles.groupLabel}>{group.bucket}</p>
              {group.rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.item}${c.id === activeId ? ` ${styles.itemActive}` : ''}`}
                  aria-current={c.id === activeId ? 'true' : undefined}
                  onClick={() => {
                    onOpen(c.id);
                    onDismiss?.();
                  }}
                >
                  <ChatIcon size={15} aria-hidden="true" />
                  <span className={styles.itemTitle}>{c.title}</span>
                  <span className={styles.itemDate}>{formatJalali(c.updatedAt, 'MM/dd')}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
