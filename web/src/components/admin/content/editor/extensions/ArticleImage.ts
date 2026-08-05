/**
 * The `image` block node (US-12.4).
 *
 * Built on Tiptap's Image extension but changed in three ways that matter:
 *
 *  1. `inline: false` — a picture in an article is a block between paragraphs,
 *     not a character inside one. Tiptap's default puts it inline, which makes
 *     it possible to end up with an image wedged mid-sentence and no way to
 *     see that that is what happened.
 *  2. `caption` and `decorative` attributes. The old editor inserted
 *     `![](url)` and there was no field anywhere that could have filled the
 *     alt in — EVERY image on the site shipped with `alt=""`. An empty alt is
 *     a legitimate value (a purely decorative picture SHOULD have one), but
 *     only when someone decided that, which is what `decorative` records. The
 *     two states look identical in the markup and completely different to a
 *     screen-reader user and to Google.
 *  3. `allowBase64: false` — an editor pasting a screenshot must go through
 *     the upload endpoint (which sniffs magic bytes) rather than embedding a
 *     multi-megabyte data: URI into the article body.
 */
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from '../ImageNodeView';

export type ImageEditRequest = {
  src: string;
  alt: string;
  caption: string;
  decorative: boolean;
  /** Natural pixel size, measured client-side right after upload — see
   *  `richDoc.ts`'s `ImageNode.attrs`. Absent for an image placed before this
   *  existed, or if the measurement failed; both are handled as "unknown". */
  width?: number | null;
  height?: number | null;
};

export interface ArticleImageOptions extends ImageOptions {
  /** Opens the alt-text/caption dialog for an already-placed image. Supplied
   *  by `RichTextEditor`, consumed by the node view. */
  onEdit?: (current: ImageEditRequest, apply: (next: ImageEditRequest) => void) => void;
}

export const ArticleImage = Image.extend<ArticleImageOptions>({
  name: 'image',
  inline: false,
  group: 'block',
  draggable: true,

  addOptions() {
    // `this.parent` is optional in Tiptap's typing, and optional-chaining it
    // would make every inherited option optional too — which does not satisfy
    // the non-optional `ImageOptions` this has to return.
    const parent = (this.parent?.() ?? {}) as ImageOptions;
    return {
      ...parent,
      inline: false,
      allowBase64: false,
      onEdit: undefined,
    };
  },

  addAttributes() {
    return {
      src: { default: '' },
      alt: {
        default: '',
        // `null` and `''` both mean "no alt text"; collapsing them here means
        // the node view has one thing to test and the serializer has one
        // thing to write.
        parseHTML: (el) => el.getAttribute('alt') ?? '',
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-caption'),
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption as string } : {}),
      },
      decorative: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-decorative') === 'true',
        renderHTML: (attrs) => (attrs.decorative ? { 'data-decorative': 'true' } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-width');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { 'data-width': String(attrs.width) } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-height');
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => (attrs.height ? { 'data-height': String(attrs.height) } : {}),
      },
      // Tiptap's Image declares `title`; the schema does not store it, and a
      // tooltip that only mouse users ever see is not an accessibility
      // feature. Dropping it keeps the node's JSON identical to what the
      // server will persist.
      title: { default: null, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
