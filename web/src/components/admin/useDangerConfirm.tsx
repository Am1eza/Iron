'use client';
/**
 * Confirm dialog for actions that destroy data.
 *
 * `ui/useConfirm` renders its confirm button as the PRIMARY action — the same
 * amber-on-cobalt affordance as «ذخیره» — so «حذف دستهٔ ورق» and «ذخیره» ended
 * up looking identical and living in the same corner of the screen. The kit
 * has no dangerous button variant to reach for (Button is
 * primary|secondary|ghost), and adding one belongs to whoever owns the design
 * system, so the admin panel styles its own here.
 *
 * The treatment is an outlined red, not a filled one, on purpose: the design
 * language reserves solid green/red for DATA, and white-on-`--color-loss` sits
 * at 4.51:1 — passing AA by a rounding error and failing it the moment anyone
 * retunes the ramp. `--color-loss-text` is the ramp step chosen to be legible
 * on a surface in both themes, so the border+text version is comfortably above
 * AA in light and dark without borrowing the data palette's fill.
 *
 * `requireTyped` adds the second gate the audit asked for on a delete whose
 * blast radius is a whole branch of the catalog: the confirm button stays
 * disabled until the admin types the thing's name. Comparison ignores ZWNJ and
 * repeated spaces — «ذوب‌آهن» and «ذوب آهن» are the same answer, and a name
 * nobody can retype is a gate that just gets clicked through somewhere else.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui';
import { Button } from '@/components/primitives/Button';
import { TextInput } from '@/components/forms/fields';
import { WarningIcon } from '@/components/primitives/icons';
import s from './dangerConfirm.module.css';

export type DangerConfirmOptions = {
  title: string;
  body: ReactNode;
  /** Defaults to «حذف کن» — this dialog only exists for destructive work. */
  confirmLabel?: string;
  /** When set, the admin must retype this exact text to enable the button. */
  requireTyped?: string;
  /** Label above the retype box, e.g. «نام دسته را بنویسید». */
  typedLabel?: string;
};

/** ZWNJ and runs of whitespace are the two ways the same Persian name gets
 *  typed differently; neither is a reason to reject a correct answer. */
const normalizeTyped = (value: string): string =>
  value.replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();

export function useDangerConfirm() {
  const [options, setOptions] = useState<DangerConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirmDanger = useCallback((opts: DangerConfirmOptions) => {
    setTyped('');
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      // A second call while a dialog is already open used to overwrite the
      // resolver and leave the first promise pending for ever — the caller
      // awaiting it never ran its `finally`. Settling it as "declined" keeps
      // the double-click path harmless.
      resolver.current?.(false);
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setOptions(null);
    setTyped('');
    resolver.current?.(value);
    resolver.current = null;
  };

  /** True while the dialog owns the screen — a caller that renders its own
   *  modal needs this to stop Escape closing both at once. */
  const isOpen = options !== null;

  const typedOk =
    !options?.requireTyped || normalizeTyped(typed) === normalizeTyped(options.requireTyped);

  const dialog = options ? (
    <Modal
      open
      onClose={() => settle(false)}
      title={options.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            انصراف
          </Button>
          <Button
            variant="secondary"
            className={s.danger}
            disabled={!typedOk}
            onClick={() => settle(true)}
          >
            <WarningIcon size={16} />
            {options.confirmLabel ?? 'حذف کن'}
          </Button>
        </>
      }
    >
      <div className={s.body}>
        <p className={s.lead}>
          <WarningIcon size={20} />
          <span>این کار برگشت‌پذیر نیست. هیچ سطل زباله و هیچ واگردی وجود ندارد.</span>
        </p>
        {options.body}
        {options.requireTyped ? (
          <TextInput
            label={options.typedLabel ?? 'برای تأیید، نام را بنویسید'}
            required
            helper={`دقیقاً بنویسید: ${options.requireTyped}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        ) : null}
      </div>
    </Modal>
  ) : null;

  return { confirmDanger, dialog, isOpen };
}
