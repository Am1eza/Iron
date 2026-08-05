'use client';
/**
 * Contains a crash to the editor panel, not the whole content queue.
 *
 * Every producer of `bodyJson` today (server-side `richDocSchema`,
 * `markdownToDoc`) stays inside the shape `RichTextEditor`'s own Tiptap
 * extensions know how to render, so this has no known way to fire yet. It
 * exists for the day that stops being true — a schema gains a node type
 * before the matching extension ships, or a row gets hand-edited in the
 * database — because without it, a single bad article throws inside
 * `useEditor`'s render and takes down the entire `/admin/content` screen:
 * the list, the filters, pagination, everything, for a non-technical writer
 * with no way back except a full page reload.
 */
import { Component, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';

export class EditorErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert tone="error">
        <p>این مقاله را نمی‌توان در ویرایشگر باز کرد؛ ساختار متن ذخیره‌شدهٔ آن با ویرایشگر همخوانی ندارد.</p>
        <p>محتوای دیگر مقاله‌ها تحت تأثیر قرار نگرفته؛ می‌توانید این مقاله را ببندید و به فهرست بازگردید.</p>
        <Button type="button" size="sm" onClick={this.props.onClose}>
          بستن
        </Button>
      </Alert>
    );
  }
}
