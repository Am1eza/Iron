'use client';
import { useEffect, useState } from 'react';
import { Modal, Chip, IconButton } from '@/components/ui';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { PlusIcon, MinusIcon } from '@/components/primitives/icons';
import styles from './KgQuantityModal.module.css';

/**
 * «۱ کیلوگرم میلگرد ۱۴» is not a purchasable unit — audit finding. A kg-basis
 * product (rebar, i-beam, …) is actually bought by شاخه or by a direct
 * tonnage figure, never by the bare kilogram `qty: 1` every add-to-cart call
 * used to default to. This is the one small step between "افزودن به سبد" and
 * an actual cart line: pick by شاخه count (when the SKU's branch weight is
 * known — the common case) or by a direct kg figure, defaulting to one
 * branch's worth rather than one kilogram.
 */
export function KgQuantityModal({
  open,
  onClose,
  productName,
  branchWeightKg,
  unitPrice,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  /** «وزن شاخه» — undefined when this SKU has none on record. */
  branchWeightKg?: number;
  /** Toman per kilogram, for the live estimate. Undefined → price withheld. */
  unitPrice?: number;
  onConfirm: (qtyKg: number) => void;
}) {
  const hasBranchWeight = !!branchWeightKg && branchWeightKg > 0;
  const [mode, setMode] = useState<'branch' | 'weight'>(hasBranchWeight ? 'branch' : 'weight');
  const [branchCount, setBranchCount] = useState(1);
  // Seeded with one branch's worth when known, rather than left at a bare
  // 1kg — the sensible-minimum-default half of the audit finding.
  const [weightInput, setWeightInput] = useState<string>(hasBranchWeight ? String(branchWeightKg) : '');

  // Re-seed every time the modal opens (possibly for a different product).
  useEffect(() => {
    if (!open) return;
    setMode(hasBranchWeight ? 'branch' : 'weight');
    setBranchCount(1);
    setWeightInput(hasBranchWeight ? String(branchWeightKg) : '');
  }, [open, hasBranchWeight, branchWeightKg]);

  const qtyKg =
    mode === 'branch' && hasBranchWeight
      ? Math.round(branchCount * branchWeightKg! * 100) / 100
      : Number(weightInput) || 0;
  const canConfirm = qtyKg > 0;
  const estimate = unitPrice ? unitPrice * qtyKg : null;

  return (
    <Modal open={open} onClose={onClose} title={`تعداد «${productName}»`}>
      <div className={styles.body}>
        {hasBranchWeight ? (
          <div className={styles.modeRow} role="group" aria-label="روش تعیین تعداد">
            <Chip variant="filter" selected={mode === 'branch'} onClick={() => setMode('branch')}>
              تعداد شاخه
            </Chip>
            <Chip variant="filter" selected={mode === 'weight'} onClick={() => setMode('weight')}>
              وزن مستقیم (کیلوگرم)
            </Chip>
          </div>
        ) : (
          <p className={styles.note}>وزن شاخهٔ این محصول ثبت نشده؛ وزن موردنیاز را مستقیم وارد کنید.</p>
        )}

        {mode === 'branch' && hasBranchWeight ? (
          <div className={styles.branchRow}>
            <IconButton
              size="sm"
              label="کاهش تعداد شاخه"
              icon={<MinusIcon size={16} />}
              disabled={branchCount <= 1}
              onClick={() => setBranchCount((c) => Math.max(1, c - 1))}
            />
            <label className={styles.branchInputWrap}>
              <span className="visually-hidden">تعداد شاخه</span>
              <input
                type="number"
                min={1}
                step={1}
                className={styles.branchInput}
                value={branchCount}
                onChange={(e) => setBranchCount(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              />
            </label>
            <IconButton
              size="sm"
              label="افزایش تعداد شاخه"
              icon={<PlusIcon size={16} />}
              onClick={() => setBranchCount((c) => c + 1)}
            />
            <span className={styles.branchHint}>
              × <span className="tnum">{toPersianDigits(branchWeightKg!)}</span> کیلوگرم هر شاخه
            </span>
          </div>
        ) : (
          <label className={styles.weightField}>
            <span className={styles.weightLabel}>وزن (کیلوگرم)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              className={styles.weightInput}
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="مثلاً ۵۰۰"
            />
          </label>
        )}

        <p className={styles.summary}>
          وزن کل: <span className="tnum">{toPersianDigits(qtyKg)}</span> کیلوگرم
          {estimate ? (
            <>
              {' · '}تخمین: <span className="tnum">{formatToman(estimate)}</span>
            </>
          ) : null}
        </p>

        <button
          type="button"
          className={styles.confirmBtn}
          disabled={!canConfirm}
          onClick={() => onConfirm(qtyKg)}
        >
          افزودن به سبد استعلام
        </button>
      </div>
    </Modal>
  );
}
