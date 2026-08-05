'use client';
/**
 * How an image looks and behaves INSIDE the editor (US-12.4).
 *
 * The single loudest thing here is the alt-text status chip. The reported
 * complaint was "I can't put a picture in the middle of an article"; the
 * quieter defect underneath it was that the old flow had no alt field at all,
 * so every image ever published carried `alt=""`. A chip that says «متن
 * جایگزین ندارد» in warning tone on the image itself is what turns that from
 * an invisible SEO/accessibility debt into something a writer can see and fix
 * without being told about it in training.
 */
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Button } from '@/components/ui';
import type { ArticleImageOptions } from './extensions/ArticleImage';
import s from './editor.module.css';

export function ImageNodeView(props: ReactNodeViewProps) {
  const { node, updateAttributes, deleteNode, selected, extension } = props;
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  const caption = node.attrs.caption ? String(node.attrs.caption) : '';
  const decorative = Boolean(node.attrs.decorative);
  const needsAlt = !decorative && alt.trim() === '';
  const onEdit = (extension.options as ArticleImageOptions).onEdit;

  return (
    <NodeViewWrapper
      as="figure"
      className={s.imageNode}
      data-selected={selected ? '' : undefined}
      // The picture and its controls are not text — leaving them editable lets
      // a stray keystroke land "inside" the image node.
      contentEditable={false}
      draggable
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={s.imageNodeImg} />
      {caption ? <figcaption className={s.imageNodeCaption}>{caption}</figcaption> : null}
      <div className={s.imageNodeBar}>
        <span className={needsAlt ? s.altWarn : s.altOk}>
          {needsAlt ? 'متن جایگزین ندارد' : decorative ? 'تصویر تزئینی' : 'متن جایگزین دارد'}
        </span>
        <Button
          type="button"
          size="sm"
          variant={needsAlt ? 'secondary' : 'ghost'}
          onClick={() =>
            onEdit?.({ src, alt, caption, decorative }, (next) =>
              updateAttributes({ alt: next.alt, caption: next.caption || null, decorative: next.decorative }),
            )
          }
        >
          {needsAlt ? 'افزودن متن جایگزین' : 'ویرایش توضیح تصویر'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => deleteNode()}>
          حذف تصویر
        </Button>
      </div>
    </NodeViewWrapper>
  );
}
