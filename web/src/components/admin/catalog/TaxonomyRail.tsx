'use client';
/**
 * The taxonomy rail (W24) — categories and their sub-categories, always on
 * screen, where a click FILTERS the product index rather than navigating.
 *
 * It replaces a tab that hid the product list: the admin previously could not
 * see the structure and its contents at the same time, so filing a product
 * meant bouncing between tabs to check a sub-category existed. Counts live
 * here too, because «this category holds 87 live products» is the fact the
 * delete dialog needs and nothing used to show.
 *
 * ---------------------------------------------------------------------------
 * Why the row actions are revealed rather than always drawn
 * ---------------------------------------------------------------------------
 * They used to be four 36px `IconButton`s sitting in the row's flex flow. Out
 * of a 280px column that left about 80px for the name AND its count, so every
 * category rendered as «نب…» / «لول…» and the admin had to hover each row to
 * find out where they were — the rail was navigation you could not read.
 *
 * The actions now sit in an absolutely-positioned cluster that costs the name
 * nothing at rest and appears on hover, on focus-within and on the selected
 * row. Keyboard users reach them by tabbing (the cluster is in the DOM the
 * whole time, so screen readers see it the whole time); pointer users get them
 * where they always were. Reordering deliberately stays a visible button
 * rather than a menu entry: burying it in ⋯ is what made admins report that
 * categories «cannot be reordered» at all.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AdminCategory, AdminSubCategory } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { groupByLabel, displayOrder } from '@/lib/utils/catalogGroups';
import { Button, IconButton, Skeleton, Spinner } from '@/components/ui';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  ExternalIcon,
  MoreIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from '@/components/primitives/icons';
import s from './catalog.module.css';

export interface RailSelection {
  categoryId: string;
  subCategoryId: string;
}

/** Kept in step with `.menu`'s `max-block-size` in catalog.module.css — it is
 *  the height the flip decision below has to reserve. */
const MENU_MAX_BLOCK_SIZE = 220;

type MenuItem = {
  key: string;
  label: string;
  /** Opens the public page in a new tab; mutually exclusive with `onSelect`. */
  href?: string | null;
  onSelect?: () => void;
  danger?: boolean;
};

/**
 * The row's overflow menu. The old one was an `aria-expanded` icon button next
 * to a plain `<div>` of buttons — no `aria-haspopup`, no `role="menu"`, no
 * Escape, no outside-click, and because it borrowed `.toolbar` it pushed the
 * rest of the rail down 16px and stayed open while the admin worked elsewhere.
 */
function NodeMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  /**
   * Open upwards when there is not room below.
   *
   * The rail is `overflow-y: auto`, so an absolutely-positioned menu on one of
   * its lower rows is CLIPPED — and because absolute positioning adds nothing
   * to the scroll height, there is no scrolling to it either. «حذف دسته» would
   * simply be unreachable on the last category, which is the same class of
   * defect as the crushed names this rail was rewritten to fix.
   *
   * Measured against the viewport rather than the scroll container: the rail
   * is sticky and sized to end at the viewport's bottom edge, and below 900px
   * it does not clip at all, where flipping near the bottom is the ordinary
   * behaviour anyway.
   */
  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setUp(rect ? rect.bottom + MENU_MAX_BLOCK_SIZE > window.innerHeight : false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Nothing else on this screen should also act on the key that closed a
      // menu the admin opened by mistake.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const moveFocus = (e: React.KeyboardEvent<HTMLDivElement>, dir: 1 | -1) => {
    e.preventDefault();
    const items_ = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    if (items_.length === 0) return;
    const at = items_.indexOf(document.activeElement as HTMLElement);
    const next = items_[(at + dir + items_.length) % items_.length];
    next?.focus();
  };

  return (
    <div className={s.menuWrap} ref={wrapRef}>
      <IconButton
        ref={triggerRef}
        label={label}
        icon={<MoreIcon size={16} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
      />
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`${s.menu} ${up ? s.menuUp : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') moveFocus(e, 1);
            else if (e.key === 'ArrowUp') moveFocus(e, -1);
          }}
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.key}
                role="menuitem"
                className={s.menuItem}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                <ExternalIcon size={14} />
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`${s.menuItem} ${item.danger ? s.menuItemDanger : ''}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.danger ? <TrashIcon size={14} /> : <EditIcon size={14} />}
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The revealed cluster — see the file header for why it is positioned out of
 *  the name's way instead of sitting in the row's flow. */
function NodeActions({ children }: { children: ReactNode }) {
  return <div className={s.nodeActions}>{children}</div>;
}

export function TaxonomyRail({
  categories,
  subsByCategory,
  selection,
  onSelect,
  onExpand,
  expanded,
  onNewCategory,
  onNewSub,
  onEditCategory,
  onEditSub,
  onDeleteCategory,
  onDeleteSub,
  onMoveCategory,
  onMoveSub,
  busy,
  categoriesLoading = false,
  subsLoading = false,
  subsError = false,
  onRetrySubs,
  categoryHref,
  subHref,
}: {
  categories: AdminCategory[];
  subsByCategory: Record<string, AdminSubCategory[]>;
  selection: RailSelection;
  onSelect: (sel: RailSelection) => void;
  expanded: Set<string>;
  onExpand: (categoryId: string) => void;
  onNewCategory: () => void;
  onNewSub: (categoryId: string) => void;
  onEditCategory: (c: AdminCategory) => void;
  onEditSub: (x: AdminSubCategory) => void;
  onDeleteCategory: (c: AdminCategory) => void;
  onDeleteSub: (x: AdminSubCategory) => void;
  onMoveCategory: (categoryId: string, dir: -1 | 1) => void;
  onMoveSub: (categoryId: string, subId: string, dir: -1 | 1) => void;
  busy: boolean;
  /** The categories request is still in flight — without this the rail draws
   *  a catalog with «همهٔ کالاها ۰» and looks empty rather than loading. */
  categoriesLoading?: boolean;
  subsLoading?: boolean;
  /** The sub-categories request failed. An expanded category then knows only
   *  that it has no sub-categories LOADED, which is a different fact from
   *  having none — and the two must never be drawn the same way. */
  subsError?: boolean;
  onRetrySubs?: () => void;
  /** Public URL of a node, or null while the data that names it is missing. */
  categoryHref?: (c: AdminCategory) => string | null;
  subHref?: (x: AdminSubCategory) => string | null;
}) {
  const allActiveSkus = categories.reduce((n, c) => n + c.skuCount, 0);

  return (
    <aside className={s.rail} aria-label="ساختار کاتالوگ">
      <div className={s.railHead}>
        <span className={s.railTitle}>دسته‌بندی‌ها</span>
        <Button size="sm" variant="secondary" onClick={onNewCategory}>
          دستهٔ جدید
        </Button>
      </div>

      {/* «همهٔ کالاها» — without a root the admin could not see the catalog as
          a whole, and an orphaned product was invisible. */}
      <div className={`${s.node} ${!selection.categoryId ? s.nodeOn : ''}`}>
        <button
          type="button"
          className={s.nodeLabel}
          aria-pressed={!selection.categoryId}
          onClick={() => onSelect({ categoryId: '', subCategoryId: '' })}
        >
          <span className={s.nodeName}>همهٔ کالاها</span>
          <span className={s.nodeCount}>{toPersianDigits(allActiveSkus)}</span>
        </button>
      </div>

      {categoriesLoading ? (
        <div className={s.railLoading} role="status">
          <Spinner size={16} />
          <span>در حال بارگذاری دسته‌ها…</span>
          <Skeleton height="var(--space-8)" />
          <Skeleton height="var(--space-8)" />
          <Skeleton height="var(--space-8)" />
        </div>
      ) : null}

      {categories.map((c, ci) => {
        const isOpen = expanded.has(c.id);
        const subs = subsByCategory[c.id] ?? [];
        // The order the rows are actually painted in, which is what the
        // move-up/down buttons have to reason about.
        const shown = displayOrder(subs);
        const selected = selection.categoryId === c.id && !selection.subCategoryId;
        const href = categoryHref?.(c) ?? null;
        return (
          <div key={c.id}>
            <div className={`${s.node} ${selected ? s.nodeOn : ''}`}>
              <button
                type="button"
                className={s.twisty}
                aria-expanded={isOpen}
                aria-label={isOpen ? `بستن ${c.name}` : `باز کردن ${c.name}`}
                onClick={() => onExpand(c.id)}
              >
                <ChevronDownIcon size={16} />
              </button>
              <button
                type="button"
                className={s.nodeLabel}
                aria-pressed={selected}
                onClick={() => onSelect({ categoryId: c.id, subCategoryId: '' })}
              >
                <span className={s.nodeName}>{c.name}</span>
                <span className={s.nodeCount}>{toPersianDigits(c.skuCount)}</span>
              </button>
              <NodeActions>
                {/* Adding a sub-category was buried in the ⋯ menu, where the
                    admin never found it. It is the second most common action on
                    this screen, so it gets its own button. */}
                <IconButton
                  label={`زیر‌دستهٔ جدید در ${c.name}`}
                  icon={<PlusIcon size={16} />}
                  onClick={() => {
                    if (!expanded.has(c.id)) onExpand(c.id);
                    onNewSub(c.id);
                  }}
                />
                <IconButton
                  label={`جابه‌جایی ${c.name} به بالا`}
                  disabled={ci === 0 || busy}
                  icon={<ChevronUpIcon size={16} />}
                  onClick={() => onMoveCategory(c.id, -1)}
                />
                <IconButton
                  label={`جابه‌جایی ${c.name} به پایین`}
                  disabled={ci === categories.length - 1 || busy}
                  icon={<ChevronDownIcon size={16} />}
                  onClick={() => onMoveCategory(c.id, 1)}
                />
                <NodeMenu
                  label={`گزینه‌های ${c.name}`}
                  items={[
                    { key: 'edit', label: 'ویرایش دسته', onSelect: () => onEditCategory(c) },
                    ...(href
                      ? [{ key: 'view', label: 'مشاهده در سایت', href }]
                      : []),
                    {
                      key: 'delete',
                      label: 'حذف دسته',
                      danger: true,
                      onSelect: () => onDeleteCategory(c),
                    },
                  ]}
                />
              </NodeActions>
            </div>

            {isOpen
              ? groupByLabel(subs).map((group) => (
                  <div key={group.label ?? `_solo_${group.items[0]!.id}`}>
                    {group.label ? <div className={s.subGroupHeader}>{group.label}</div> : null}
                    {group.items.map((x) => {
                      const subSelected = selection.subCategoryId === x.id;
                      // Position in the order this rail SHOWS — clusters at
                      // their first member's place, members contiguous — which
                      // is also the order `onMoveSub` now swaps in. Using the
                      // raw array index instead disabled the wrong buttons and
                      // let the admin press an enabled one that provably could
                      // not change anything they could see.
                      const flatIndex = shown.indexOf(x);
                      const subUrl = subHref?.(x) ?? null;
                      return (
                        <div
                          key={x.id}
                          className={`${s.node} ${s.subNode} ${subSelected ? s.nodeOn : ''}`}
                        >
                          <button
                            type="button"
                            className={s.nodeLabel}
                            aria-pressed={subSelected}
                            onClick={() => onSelect({ categoryId: c.id, subCategoryId: x.id })}
                          >
                            <span className={s.nodeName}>{x.name}</span>
                            <span className={s.nodeCount}>{toPersianDigits(x.skuCount)}</span>
                          </button>
                          <NodeActions>
                            <IconButton
                              label={`ویرایش ${x.name}`}
                              icon={<EditIcon size={16} />}
                              onClick={() => onEditSub(x)}
                            />
                            <IconButton
                              label={`جابه‌جایی ${x.name} به بالا`}
                              disabled={flatIndex === 0 || busy}
                              icon={<ChevronUpIcon size={16} />}
                              onClick={() => onMoveSub(c.id, x.id, -1)}
                            />
                            <IconButton
                              label={`جابه‌جایی ${x.name} به پایین`}
                              disabled={flatIndex === shown.length - 1 || busy}
                              icon={<ChevronDownIcon size={16} />}
                              onClick={() => onMoveSub(c.id, x.id, 1)}
                            />
                            <NodeMenu
                              label={`گزینه‌های ${x.name}`}
                              items={[
                                ...(subUrl
                                  ? [{ key: 'view', label: 'مشاهده در سایت', href: subUrl }]
                                  : []),
                                {
                                  key: 'delete',
                                  label: 'حذف زیر‌دسته',
                                  danger: true,
                                  onSelect: () => onDeleteSub(x),
                                },
                              ]}
                            />
                          </NodeActions>
                        </div>
                      );
                    })}
                  </div>
                ))
              : null}

            {/* The three states below were one state before: an expanded
                category with nothing under it invited the admin to «build the
                first sub-category» whether the branch was genuinely empty, its
                nineteen sub-categories were still in flight, or the request had
                failed outright. The last of those is an invitation to rebuild
                rows that already exist. */}
            {isOpen && subs.length === 0 && subsLoading ? (
              <div className={`${s.node} ${s.subNode} ${s.subsPending}`} role="status">
                <Spinner size={16} />
                <span>در حال بارگذاری زیر‌دسته‌ها…</span>
              </div>
            ) : null}

            {isOpen && subs.length === 0 && !subsLoading && subsError ? (
              <div className={`${s.node} ${s.subNode} ${s.subsFailed}`} role="alert">
                <WarningIcon size={16} />
                <span>زیر‌دسته‌ها بارگذاری نشدند — این دسته ممکن است زیر‌دسته داشته باشد.</span>
                {onRetrySubs ? (
                  <Button size="sm" variant="secondary" onClick={onRetrySubs}>
                    تلاش دوباره
                  </Button>
                ) : null}
              </div>
            ) : null}

            {isOpen && subs.length === 0 && !subsLoading && !subsError ? (
              <div className={`${s.node} ${s.subNode}`}>
                {/* A dead end here is what made the admin think sub-categories
                    could not be created at all. */}
                <Button size="sm" variant="ghost" onClick={() => onNewSub(c.id)}>
                  <PlusIcon size={14} />
                  اولین زیر‌دسته را بسازید
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}
