'use client';
/**
 * «زنگِ میز کار» — makes the laptop ring when new work lands. Plays a short
 * two-tone (WebAudio, no asset needed) and raises a desktop notification so
 * staff notice a fresh inbound even while looking at another tab.
 *
 * Scope follows the signed-in role: a مدیر سیستم watches the whole panel
 * (global stats), everyone else with leads:read watches THEIR OWN desk — a
 * sales rep used to be rung for every lead in the system, including ones that
 * were never going to be theirs. Roles without leads:read get no alert source
 * at all (the stats endpoint omits those fields for them anyway) and render
 * nothing.
 *
 * Silent until the first tick establishes a baseline, so it never rings on
 * page load, and permanently silenceable via the mute toggle (persisted).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
// The auth store directly, NOT useAuth(): this component sits in the admin
// shell (i.e. on every panel page) and useAuth pulls the `@/lib/api` barrel —
// and with it the zod catalog/market schemas — onto that critical path.
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';
import { toPersianDigits } from '@/lib/utils/format';
import { BellIcon } from '@/components/primitives/icons';
import { IconButton } from '@/components/ui';

const POLL_MS = 20_000;
const MUTE_KEY = 'ahantime.alerts.muted';
/** Remembers that we already spent this browser's one polite permission
 *  prompt — see the request effect. */
const ASKED_KEY = 'ahantime.alerts.asked';

/** localStorage throws in Safari private mode / with cookies blocked, and an
 *  alert bell is never worth taking the panel down for. */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* non-persistent this session — the in-memory state still holds */
  }
}

function ring() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = [880, 1175]; // a two-tone "ring-ring"
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio blocked — the notification still fires */
  }
}

/** No slashed bell in the shared set and icons.tsx isn't this file's to extend:
 *  same 24-grid / 1.75-stroke geometry as BellIcon plus the mute slash. */
function BellOffIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 004 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/**
 * Collects the id of every lead row anywhere in the desk payload. Deliberately
 * shape-agnostic: the desk response is mid-migration (lists are becoming
 * `{rows,total,hasMore,limit}` and `callbacks` is splitting into
 * overdue/upcoming), and the bell must not start ringing — or stop ringing —
 * because a nesting level moved. A row is anything carrying both `id` and
 * `contactMobile`, which no other node in that payload does.
 */
function collectRowIds(node: unknown, into: Set<string>, depth = 0): void {
  if (!node || depth > 5) return;
  if (Array.isArray(node)) {
    for (const item of node) collectRowIds(item, into, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (typeof rec.id === 'string' && typeof rec.contactMobile === 'string') {
    into.add(rec.id);
    return;
  }
  for (const value of Object.values(rec)) collectRowIds(value, into, depth + 1);
}

export function AdminAlerts() {
  const role = useAuthStore((s) => s.user?.role);
  // Admins keep the panel-wide view they actually want; every other role that
  // can see leads is scoped to its own desk. `null` while the session is still
  // resolving, and for roles with no inbound work (content/catalog/operator).
  const scope: 'global' | 'desk' | null = !role ? null : role === 'admin' ? 'global' : can(role, 'leads:read') ? 'desk' : null;

  const [muted, setMuted] = useState(false);
  // Mirrored into a ref so the detection effects depend on the poll data ONLY
  // — re-running them on a mute toggle would re-diff an already-consumed tick.
  const mutedRef = useRef(false);
  useEffect(() => {
    const stored = readFlag(MUTE_KEY);
    mutedRef.current = stored;
    setMuted(stored);
  }, []);

  useEffect(() => {
    // Browsers auto-suppress permission prompts not triggered by a user
    // gesture — a mount-time request silently never shows for most staff.
    // Ask on the FIRST pointer interaction instead (once, then detach), and
    // only once per browser: a dismissed prompt leaves permission at
    // 'default', so without the flag every single login re-nagged. Muted or
    // alert-less roles are never asked at all — there'd be nothing to deliver.
    if (scope === null || muted) return;
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    if (readFlag(ASKED_KEY)) return;
    const ask = () => {
      writeFlag(ASKED_KEY, true);
      void Notification.requestPermission();
    };
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, [scope, muted]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    writeFlag(MUTE_KEY, next);
    // Un-muting is unambiguous intent inside a real user gesture — the one
    // moment it's worth re-asking someone who dismissed the prompt before.
    if (!next && 'Notification' in window && Notification.permission === 'default') {
      writeFlag(ASKED_KEY, true);
      void Notification.requestPermission();
    }
  }, []);

  const announce = useCallback((body: string) => {
    if (mutedRef.current) return;
    ring();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('آهن‌تایم — کار جدید', { body, tag: 'ahantime-inbound' });
    }
  }, []);

  // refetchIntervalInBackground: without it React Query pauses the poll the
  // moment the tab loses focus — which is precisely when the desktop
  // notification is the only thing that can reach the operator. The bell was
  // dead exactly when it mattered.
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.stats(),
    enabled: scope === 'global',
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  // Same cache key MyDesk uses, so this is a shared poll rather than a third
  // one — and it keeps the desk table fresher (20s) while it's on screen.
  const { data: deskData } = useQuery({
    queryKey: ['admin', 'my', 'desk'],
    queryFn: () => adminApi.myDesk(),
    enabled: scope === 'desk',
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  /** Ids already accounted for — never pruned, so a row that drops out of the
   *  capped window and comes back can't ring a second time. */
  const seenIds = useRef<Set<string> | null>(null);
  const assignedBaseline = useRef<number | null>(null);
  const countBaseline = useRef<{ newLeads: number; newMessages: number } | null>(null);

  useEffect(() => {
    // `enabled: false` still hands back whatever is in the shared cache (the
    // nav badges poll ['admin','stats'] too), so the scope gate has to be here
    // as well or a rep would be alerted by the global numbers anyway.
    if (scope !== 'desk' || !deskData) return;
    const ids = new Set<string>();
    collectRowIds(deskData, ids);
    const assigned = deskData.stats?.assigned ?? 0;

    const seen = seenIds.current;
    const prevAssigned = assignedBaseline.current;
    seenIds.current = seen ? new Set([...seen, ...ids]) : ids;
    assignedBaseline.current = assigned;
    if (!seen || prevAssigned === null) return; // first tick = baseline, no ring

    // Counting ARRIVALS (unseen ids), not the net size of the desk: one lead
    // closed and another assigned inside the same 20s window nets to zero and
    // used to ring nothing at all. The assigned-total growth is the backstop
    // for arrivals that land outside the row cap (the active list is capped
    // and ordered by createdAt, so an old lead newly assigned can be missing).
    let fresh = 0;
    for (const id of ids) if (!seen.has(id)) fresh += 1;
    const count = Math.max(fresh, assigned - prevAssigned);
    if (count > 0) announce(`${toPersianDigits(count)} مورد جدید روی میز کار شما قرار گرفت.`);
  }, [scope, deskData, announce]);

  useEffect(() => {
    if (scope !== 'global' || !statsData?.stats) return;
    const s = statsData.stats;
    const next = { newLeads: s.newLeads ?? 0, newMessages: s.newMessages ?? 0 };
    const prev = countBaseline.current;
    countBaseline.current = next;
    if (!prev) return; // first tick = baseline, no ring

    // Per bucket, and only the rises: summing leads+messages first meant a
    // claimed lead silently cancelled out a brand-new contact message.
    const count =
      Math.max(0, next.newLeads - prev.newLeads) + Math.max(0, next.newMessages - prev.newMessages);
    if (count > 0) announce(`${toPersianDigits(count)} مورد جدید (سرنخ/پیام) در پنل ثبت شد.`);
  }, [scope, statsData, announce]);

  if (scope === null) return null;

  // Fixed, bottom corner: the shell is a flex column and this component is
  // mounted between the topbar and the body, so anything in normal flow would
  // push the whole panel down. Out of flow costs the layout nothing, and the
  // shell's own layout file belongs to another workstream.
  return (
    <IconButton
      label="بی‌صدا کردن اعلان کارهای جدید"
      icon={muted ? <BellOffIcon size={18} /> : <BellIcon size={18} />}
      variant="subtle"
      size="sm"
      active={muted}
      onClick={toggleMute}
      style={{
        position: 'fixed',
        insetBlockEnd: 'var(--space-4)',
        insetInlineEnd: 'var(--space-4)',
        zIndex: 'var(--z-fab)',
        boxShadow: 'var(--shadow-sm)',
      }}
    />
  );
}
