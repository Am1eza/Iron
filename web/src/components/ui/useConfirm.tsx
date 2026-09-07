'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from '@/components/primitives/Button';

type ConfirmOptions = {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
};

/**
 * Promise-based confirm dialog — replaces native `window.confirm()`, which is
 * unstyled, always LTR and ignores the app's RTL/brand chrome. Usage:
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: '…', body: '…' })) { ... }
 *   return <>{dialog}...</>
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );

  const confirm = useCallback((opts: ConfirmOptions) => {
    // Replacing a prompt cancels its pending decision instead of leaking it.
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setOptions(null);
    resolver.current?.(value);
    resolver.current = null;
  };

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
          <Button onClick={() => settle(true)}>{options.confirmLabel ?? 'ادامه'}</Button>
        </>
      }
    >
      {options.body}
    </Modal>
  ) : null;

  return { confirm, dialog };
}
