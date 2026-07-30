'use client';
/**
 * The taxonomy rail (W24) — categories and their sub-categories, always on
 * screen, where a click FILTERS the product index rather than navigating.
 *
 * It replaces a tab that hid the product list: the admin previously could not
 * see the structure and its contents at the same time, so filing a product
 * meant bouncing between tabs to check a sub-category existed. Counts live
 * here too, because «this category holds 87 live products» is the fact the
 * deactivate dialog needs and nothing used to show.
 */
import { useState } from 'react';
import type { AdminCategory, AdminSubCategory } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { Badge, Button, IconButton, Switch } from '@/components/ui';
import { ChevronDownIcon } from '@/components/primitives/icons';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

export interface RailSelection {
  categoryId: string;
  subCategoryId: string;
}

export function TaxonomyRail({
  categories,
  subsByCategory,
  selection,
  onSelect,
  onExpand,
  expanded,
  showInactive,
  onShowInactive,
  onNewCategory,
  onNewSub,
  onEditCategory,
  onEditSub,
  onDeactivateCategory,
  onDeactivateSub,
  onReactivateCategory,
  onReactivateSub,
  onMoveCategory,
  onMoveSub,
  busy,
}: {
  categories: AdminCategory[];
  subsByCategory: Record<string, AdminSubCategory[]>;
  selection: RailSelection;
  onSelect: (sel: RailSelection) => void;
  expanded: Set<string>;
  onExpand: (categoryId: string) => void;
  showInactive: boolean;
  onShowInactive: (v: boolean) => void;
  onNewCategory: () => void;
  onNewSub: (categoryId: string) => void;
  onEditCategory: (c: AdminCategory) => void;
  onEditSub: (x: AdminSubCategory) => void;
  onDeactivateCategory: (c: AdminCategory) => void;
  onDeactivateSub: (x: AdminSubCategory) => void;
  onReactivateCategory: (c: AdminCategory) => void;
  onReactivateSub: (x: AdminSubCategory) => void;
  onMoveCategory: (categoryId: string, dir: -1 | 1) => void;
  onMoveSub: (categoryId: string, subId: string, dir: -1 | 1) => void;
  busy: boolean;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const visibleCats = categories.filter((c) => showInactive || c.isActive);
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

      {visibleCats.map((c, ci) => {
        const isOpen = expanded.has(c.id);
        const subs = (subsByCategory[c.id] ?? []).filter((x) => showInactive || x.isActive);
        const selected = selection.categoryId === c.id && !selection.subCategoryId;
        return (
          <div key={c.id}>
            <div className={`${s.node} ${selected ? s.nodeOn : ''} ${c.isActive ? '' : s.nodeInactive}`}>
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
              <IconButton
                label={`گزینه‌های ${c.name}`}
                size="sm"
                icon={<span aria-hidden="true">⋯</span>}
                onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
              />
            </div>

            {menuFor === c.id ? (
              <div className={ui.toolbar} style={{ padding: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button size="sm" variant="ghost" onClick={() => onEditCategory(c)}>
                  ویرایش
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onNewSub(c.id)}>
                  زیر‌دستهٔ جدید
                </Button>
                <IconButton
                  label={`جابه‌جایی ${c.name} به بالا`}
                  size="sm"
                  disabled={ci === 0 || busy}
                  icon={<ChevronDownIcon size={16} style={{ transform: 'rotate(180deg)' }} />}
                  onClick={() => onMoveCategory(c.id, -1)}
                />
                <IconButton
                  label={`جابه‌جایی ${c.name} به پایین`}
                  size="sm"
                  disabled={ci === visibleCats.length - 1 || busy}
                  icon={<ChevronDownIcon size={16} />}
                  onClick={() => onMoveCategory(c.id, 1)}
                />
                {c.isActive ? (
                  <Button size="sm" variant="ghost" onClick={() => onDeactivateCategory(c)}>
                    غیرفعال‌سازی
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onReactivateCategory(c)}>
                    فعال‌سازی
                  </Button>
                )}
              </div>
            ) : null}

            {isOpen
              ? subs.map((x, si) => {
                  const subSelected = selection.subCategoryId === x.id;
                  return (
                    <div
                      key={x.id}
                      className={`${s.node} ${s.subNode} ${subSelected ? s.nodeOn : ''} ${x.isActive ? '' : s.nodeInactive}`}
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
                      <IconButton
                        label={`ویرایش ${x.name}`}
                        size="sm"
                        icon={<span aria-hidden="true">✎</span>}
                        onClick={() => onEditSub(x)}
                      />
                      <IconButton
                        label={`جابه‌جایی ${x.name} به بالا`}
                        size="sm"
                        disabled={si === 0 || busy}
                        icon={<ChevronDownIcon size={14} style={{ transform: 'rotate(180deg)' }} />}
                        onClick={() => onMoveSub(c.id, x.id, -1)}
                      />
                      <IconButton
                        label={`جابه‌جایی ${x.name} به پایین`}
                        size="sm"
                        disabled={si === subs.length - 1 || busy}
                        icon={<ChevronDownIcon size={14} />}
                        onClick={() => onMoveSub(c.id, x.id, 1)}
                      />
                      {x.isActive ? (
                        <IconButton
                          label={`غیرفعال‌سازی ${x.name}`}
                          size="sm"
                          icon={<span aria-hidden="true">×</span>}
                          onClick={() => onDeactivateSub(x)}
                        />
                      ) : (
                        <IconButton
                          label={`فعال‌سازی ${x.name}`}
                          size="sm"
                          icon={<span aria-hidden="true">↺</span>}
                          onClick={() => onReactivateSub(x)}
                        />
                      )}
                    </div>
                  );
                })
              : null}
            {isOpen && subs.length === 0 ? (
              <div className={`${s.node} ${s.subNode}`}>
                <span className={ui.tileHint}>زیر‌دسته‌ای نیست</span>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className={s.railFoot}>
        <Switch
          checked={showInactive}
          onChange={onShowInactive}
          label="نمایش غیرفعال‌ها"
        />
        {categories.some((c) => !c.isActive) && !showInactive ? (
          <Badge tone="stale">
            {toPersianDigits(categories.filter((c) => !c.isActive).length)} دستهٔ غیرفعال پنهان است
          </Badge>
        ) : null}
      </div>
    </aside>
  );
}
